#!/usr/bin/env node
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const DIST_DIR = 'dist';
const PUBLIC_ASSET_BASE_URL = 'https://ztools.zosen.link';
const BASE64_IMAGE_OUTPUT_DIR = join(DIST_DIR, 'images', 'logo');
const BASE64_IMAGE_PUBLIC_PATH = 'images/logo';
const DOWNLOAD_MAX_ATTEMPTS = 5;
const DOWNLOAD_RETRY_DELAY_MS = 2000;
const GITHUB_RELEASE_ASSET_URL_PATTERN = /^https:\/\/github\.com\/ZToolsCenter\/ZTools-plugins\/releases\/download\/[^/]+\/([^/?#]+)([?#].*)?$/;
const BASE64_IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+(?:;[^,]*)*);base64,([\s\S]+)$/i;

function printUsage() {
  console.log(`
用法:
  npm run download:latest-assets
  node scripts/download-latest-assets.js

说明:
  匿名获取当前 GitHub 仓库的最新 release，并将所有 assets 下载到 dist 目录。
  会将 JSON 中的 base64 图片转换为图片文件放入 dist/images/logo，
  并替换为 EdgeOne 静态访问地址。
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

function rewriteReleaseAssetUrls(value) {
  if (typeof value === 'string') {
    const match = value.match(GITHUB_RELEASE_ASSET_URL_PATTERN);
    if (!match) {
      return {
        value,
        changedCount: 0,
      };
    }

    return {
      value: `${PUBLIC_ASSET_BASE_URL}/${match[1]}`,
      changedCount: 1,
    };
  }

  if (Array.isArray(value)) {
    let changedCount = 0;
    const nextValue = value.map((item) => {
      const result = rewriteReleaseAssetUrls(item);
      changedCount += result.changedCount;
      return result.value;
    });

    return {
      value: nextValue,
      changedCount,
    };
  }

  if (value && typeof value === 'object') {
    let changedCount = 0;
    const nextValue = {};

    for (const [key, item] of Object.entries(value)) {
      const result = rewriteReleaseAssetUrls(item);
      changedCount += result.changedCount;
      nextValue[key] = result.value;
    }

    return {
      value: nextValue,
      changedCount,
    };
  }

  return {
    value,
    changedCount: 0,
  };
}

function getImageExtension(contentType) {
  const mimeType = contentType.toLowerCase().split(';')[0];
  const subtype = mimeType.slice('image/'.length);

  if (subtype === 'jpeg' || subtype === 'pjpeg') return 'jpg';
  if (subtype === 'svg+xml') return 'svg';
  if (subtype === 'x-icon' || subtype === 'vnd.microsoft.icon') return 'ico';

  const normalizedSubtype = subtype
    .replace(/\+xml$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalizedSubtype || 'img';
}

function getPublicAssetUrl(relativePath) {
  return `${PUBLIC_ASSET_BASE_URL}/${relativePath}`;
}

function sanitizeFileNamePart(value) {
  return String(value)
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getPluginNameFileNamePart(value) {
  return String(value).trim();
}

function getPluginImageContext(value, parentContext) {
  const nextContext = { ...parentContext };

  if (typeof value.name === 'string' && value.name.trim()) {
    nextContext.name = value.name;
  }

  if (value.version !== undefined && value.version !== null && String(value.version).trim()) {
    nextContext.version = String(value.version);
  }

  return nextContext;
}

function getImageFileName(imageBuffer, extension, imageContext) {
  const hash = createHash('sha256').update(imageBuffer).digest('hex');
  const pluginName = imageContext.name ? getPluginNameFileNamePart(imageContext.name) : '';
  const pluginVersion = imageContext.version ? sanitizeFileNamePart(imageContext.version) : '';

  if (pluginName && pluginVersion) {
    return {
      fileName: `${pluginName}-${pluginVersion}.${extension}`,
      hash,
    };
  }

  return {
    fileName: `image-${hash.slice(0, 16)}.${extension}`,
    hash,
  };
}

async function writeBase64ImageFile(dataUrl, convertedImages, imageContext) {
  const match = dataUrl.match(BASE64_IMAGE_DATA_URL_PATTERN);
  if (!match) {
    return null;
  }

  const [, contentType, base64Payload] = match;
  const imageBuffer = Buffer.from(base64Payload.replace(/\s/g, ''), 'base64');

  if (imageBuffer.length === 0) {
    throw new Error('发现空的 base64 图片内容');
  }

  const extension = getImageExtension(contentType);
  const { fileName, hash } = getImageFileName(imageBuffer, extension, imageContext);
  const relativePath = `${BASE64_IMAGE_PUBLIC_PATH}/${fileName}`;

  const convertedImage = convertedImages.get(fileName);
  if (convertedImage) {
    if (convertedImage.hash !== hash) {
      throw new Error(`图片文件名冲突: ${fileName}`);
    }

    return convertedImage.url;
  }

  if (!convertedImages.has(fileName)) {
    await mkdir(BASE64_IMAGE_OUTPUT_DIR, { recursive: true });
    await writeFile(join(BASE64_IMAGE_OUTPUT_DIR, fileName), imageBuffer);
    convertedImages.set(fileName, {
      hash,
      url: getPublicAssetUrl(relativePath),
    });
  }

  return convertedImages.get(fileName).url;
}

async function rewriteBase64ImageUrls(value, convertedImages, imageContext = {}) {
  if (typeof value === 'string') {
    const imageUrl = await writeBase64ImageFile(value, convertedImages, imageContext);
    return {
      value: imageUrl || value,
      changedCount: imageUrl ? 1 : 0,
    };
  }

  if (Array.isArray(value)) {
    let changedCount = 0;
    const nextValue = [];

    for (const item of value) {
      const result = await rewriteBase64ImageUrls(item, convertedImages, imageContext);
      changedCount += result.changedCount;
      nextValue.push(result.value);
    }

    return {
      value: nextValue,
      changedCount,
    };
  }

  if (value && typeof value === 'object') {
    let changedCount = 0;
    const nextValue = {};
    const nextContext = getPluginImageContext(value, imageContext);

    for (const [key, item] of Object.entries(value)) {
      const result = await rewriteBase64ImageUrls(item, convertedImages, nextContext);
      changedCount += result.changedCount;
      nextValue[key] = result.value;
    }

    return {
      value: nextValue,
      changedCount,
    };
  }

  return {
    value,
    changedCount: 0,
  };
}

async function updatePluginsJsonDownloadUrls() {
  const pluginsJsonPath = join(DIST_DIR, 'plugins.json');

  if (!existsSync(pluginsJsonPath)) {
    console.warn(`未找到 ${pluginsJsonPath}，跳过下载地址更新`);
    return;
  }

  const pluginsJson = JSON.parse(await readFile(pluginsJsonPath, 'utf-8'));
  const { value: updatedPluginsJson, changedCount } = rewriteReleaseAssetUrls(pluginsJson);

  await writeFile(
    pluginsJsonPath,
    `${JSON.stringify(updatedPluginsJson, null, 2)}\n`,
    'utf-8',
  );

  console.log(`✓ 已更新 plugins.json 中 ${changedCount} 个 GitHub Release 下载地址`);
}

async function getJsonFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await getJsonFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }

  return files;
}

async function updateBase64ImagesInJsonFiles() {
  const jsonFiles = await getJsonFiles(DIST_DIR);

  if (jsonFiles.length === 0) {
    console.warn(`未找到 ${DIST_DIR} 目录下的 JSON 文件，跳过 base64 图片转换`);
    return;
  }

  const convertedImages = new Map();
  let changedFileCount = 0;
  let changedImageCount = 0;

  for (const jsonFile of jsonFiles) {
    const json = JSON.parse(await readFile(jsonFile, 'utf-8'));
    const { value: updatedJson, changedCount } = await rewriteBase64ImageUrls(json, convertedImages);

    if (changedCount === 0) {
      continue;
    }

    await writeFile(
      jsonFile,
      `${JSON.stringify(updatedJson, null, 2)}\n`,
      'utf-8',
    );

    changedFileCount += 1;
    changedImageCount += changedCount;
  }

  console.log(`✓ 已转换 ${changedImageCount} 个 base64 图片，生成 ${convertedImages.size} 个 EdgeOne 静态图片文件，更新 ${changedFileCount} 个 JSON 文件`);
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

  await updatePluginsJsonDownloadUrls();
  await updateBase64ImagesInJsonFiles();

  console.log(`\n✓ 所有 assets 已下载到 ${DIST_DIR} 目录`);
}

main().catch(error => {
  console.error('执行失败:', error.message);
  process.exit(1);
});
