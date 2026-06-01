#!/usr/bin/env node
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execSync } from 'node:child_process';

const DIST_DIR = 'dist';
const DOWNLOAD_MAX_ATTEMPTS = 5;
const DOWNLOAD_RETRY_DELAY_MS = 2000;

function printUsage() {
  console.log(`
用法:
  npm run download:latest-assets
  node scripts/download-latest-assets.js

说明:
  匿名获取当前 GitHub 仓库的最新 release，并将所有 assets 下载到 dist 目录。
  仓库信息优先读取 GITHUB_REPOSITORY=owner/repo，否则从 git remote origin 解析。
`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRepoInfo() {
  const repository = process.env.GITHUB_REPOSITORY || '';

  if (repository) {
    const [owner, repo] = repository.split('/');
    if (owner && repo) {
      return { owner, repo };
    }
  }

  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    const match = remote.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  } catch (error) {
    console.error(`无法获取 git remote 信息: ${error.message}`);
  }

  throw new Error('无法确定 GitHub 仓库信息，请设置 GITHUB_REPOSITORY=owner/repo 或配置 git remote origin');
}

async function removeFileIfExists(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  try {
    await unlink(filePath);
  } catch (error) {
    console.warn(`删除未完成文件失败: ${filePath} - ${error.message}`);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ztools-plugins-assets-downloader',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API 请求失败: ${response.status} ${response.statusText} ${body}`);
  }

  return response.json();
}

async function downloadFile(url, destPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ztools-plugins-assets-downloader',
    },
  });

  if (!response.ok) {
    throw new Error(`下载失败: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('下载失败: 响应内容为空');
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(destPath));
}

async function downloadFileWithRetry(url, destPath, fileName) {
  let lastError;

  for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`  重试 ${attempt}/${DOWNLOAD_MAX_ATTEMPTS}: ${fileName}`);
      }

      await downloadFile(url, destPath);
      return;
    } catch (error) {
      lastError = error;
      await removeFileIfExists(destPath);

      if (attempt < DOWNLOAD_MAX_ATTEMPTS) {
        console.warn(`  第 ${attempt}/${DOWNLOAD_MAX_ATTEMPTS} 次下载失败: ${fileName} - ${error.message}，${DOWNLOAD_RETRY_DELAY_MS / 1000} 秒后重试...`);
        await sleep(DOWNLOAD_RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(`已重试 ${DOWNLOAD_MAX_ATTEMPTS} 次仍失败: ${lastError.message}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    printUsage();
    return;
  }

  const { owner, repo } = getRepoInfo();
  const latestReleaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

  console.log(`仓库: ${owner}/${repo}`);
  console.log('获取最新 release...');

  const latestRelease = await fetchJson(latestReleaseUrl);

  console.log(`找到最新 release: ${latestRelease.tag_name}`);
  console.log(`资产数量: ${latestRelease.assets.length}`);

  await mkdir(DIST_DIR, { recursive: true });

  if (latestRelease.assets.length === 0) {
    console.log('最新 release 没有 assets，跳过下载');
    return;
  }

  const failedAssets = [];

  for (const asset of latestRelease.assets) {
    const fileName = basename(asset.name);
    const destPath = join(DIST_DIR, fileName);

    console.log(`下载: ${asset.name} (${(asset.size / 1024).toFixed(2)} KB)`);

    try {
      await downloadFileWithRetry(asset.browser_download_url, destPath, asset.name);
      console.log(`✓ 下载完成: ${fileName}`);
    } catch (error) {
      console.error(`✗ 下载失败: ${asset.name} - ${error.message}`);
      failedAssets.push({
        name: asset.name,
        error: error.message,
      });
    }
  }

  if (failedAssets.length > 0) {
    const failedList = failedAssets
      .map(asset => `${asset.name} (${asset.error})`)
      .join(', ');
    throw new Error(`assets 下载失败 ${failedAssets.length} 个: ${failedList}`);
  }

  console.log(`\n✓ 所有 assets 已下载到 ${DIST_DIR} 目录`);
}

main().catch(error => {
  console.error('执行失败:', error.message);
  process.exit(1);
});
