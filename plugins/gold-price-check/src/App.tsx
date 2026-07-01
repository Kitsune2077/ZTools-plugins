import { useEffect, useState } from 'react'
import GoldPrice from './GoldPrice'

const isZTools = typeof window !== 'undefined' && Boolean(window.ztools)

export default function App() {
  const [enterAction, setEnterAction] = useState<any>({})
  const [route, setRoute] = useState('')

  useEffect(() => {
    if (!isZTools) return
    window.ztools.onPluginEnter((action) => {
      setRoute(action.code)
      setEnterAction(action)
    })
    window.ztools.onPluginOut(() => {
      setRoute('')
    })
  }, [])

  // 非 ZTools 环境（浏览器开发模式），默认显示金价页面
  if (!isZTools) return <GoldPrice />

  if (route === 'gold') return <GoldPrice />

  // 默认也显示金价页面
  return <GoldPrice />
}