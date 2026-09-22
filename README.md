# 三国演义 · 群英谱

三国人物、年表、政权、关系网络、地理、评论与解谜的一体化资料站，共 699 位人物。

## 页面

| 文件 | 内容 |
| --- | --- |
| index.html | 首页 · 精选与入口 |
| people.html | 人物谱（可检索，150 位主要人物带事件详解） |
| timeline.html | 六段年表 |
| states.html | 政权与制度 |
| network.html | 人物关系网络图 |
| map.html | 地理与战役图（默认内置示意图，可切换到高德矢量/卫星） |
| game.html | 猜人物解谜 |
| insights.html | 名家论三国 |
| offline.html | 单文件离线版（1.7 MB，断网可用，可直接在微信里传文件打开） |

## 技术要点

- 零构建、零框架、零外链 CDN：字体走系统栈，无任何 Google Fonts
- 数据以 script 标签注入，不使用 fetch，file:// 下也能跑
- 事件详解按人物分片（15 个），点开谁才加载谁
- Leaflet 按需加载：默认示意图模式不发任何外部请求
- Service Worker 缓存站内资源，二次进入秒开、断网可看
- 微信内置浏览器适配：视口修正、老内核兜底、脚本异常可读提示

## 本地预览

需要用 http 打开（Service Worker 要求 https 或 localhost）：

```sh
python -m http.server 8000
# 打开 http://localhost:8000/
```
直接双击 index.html 也能看，只是没有离线缓存。
