# GPU Data Hall Builder

用于体验搭建 AI 数据中心的模拟器，重点是 NVIDIA 新一代 GPU 机柜（GB200/GB300 NVL72、Vera Rubin NVL72、Kyber）。
目标形态：网页版（传播和容量规划逻辑）+ Unity 版（沉浸体验、VR、托盘拆解、故障演练）。
数据格式兼容 OpenUSD，为以后接入 NVIDIA SimReady 资产和 Omniverse DSX 生态留路。

## 目录

- `web/`：网页版，Vite + three.js 0.128（npm 锁版本），入口 `web/index.html` → `web/src/main.js`
  - `src/catalog.js`：import `spec/catalog.json`，构建时打进包里
  - `src/sim.js`：容量模型与 PUE，纯函数
  - `src/usd-export.js`：`buildUsda`，纯函数，不依赖 DOM 和 three，node 可直接 import
  - `src/download.js`：有 `window.claude` 走 downloads（zip），否则 Blob 直接下载 `.usda`
  - `src/scene.js` / `src/controls.js`：three 场景、拾取、轨道相机与指针输入
  - `src/ui.js`：右侧面板；`src/state.js`：共享状态；`src/layout.js`：预设与 localStorage；`src/grid.js`：网格常量
  - `tests/`：vitest；`usd-export.test.js` 从样例反解设备清单再生成，要求与 `samples/datahall.usda` 逐字节一致
- `spec/catalog.json`：设备目录，**唯一数据源**
- `samples/datahall.usda`：导出样例，已用 OpenUSD 26.08 验证，同时是导出回归测试的 golden 文件
- `tools/validate_usd.py`：USD 校验脚本（`pip install usd-core`）

## 运行

```bash
cd web && npm i
npm run dev        # 开发服务器
npm test           # vitest
npm run build      # 产物在 web/dist，base 为相对路径，可部署到任意子路径
pip install usd-core && python3 tools/validate_usd.py samples/datahall.usda
```

## 已定的设计决策

- **容量模型**：配电（RPP）、液冷（CDU）、风冷（列间空调）、后端网络端口、市电五项约束，任一不满足不能通电。
  PUE 估算：`(IT + 设备自耗 + 液冷热量×0.08 + 风冷热量×0.30 + IT×0.05) / IT`，是教学用简化公式。
- **OpenUSD 约定**：Z 轴向上，metersPerUnit = 1，defaultPrim = `/DataHall`。
  - `/DataHall/Catalog/<id>`：`class` 原型，带参数和简化几何
  - `/DataHall/Equipment/Rxx_Cyy`：`instanceable` 实例，引用 Catalog 原型
  - 参数用 `dchall:` 命名空间自定义属性；拓扑用 relationship：`dchall:coolantSource`→CDU，`dchall:powerFeed`→RPP
  - 替换高精度模型的方式：在更强的层对 Catalog 原型写 `over`
- **网格坐标**：网页里 three.js 是 Y-up，导出时 `(x, y, z)_three → (x, -z, y)_usd`。格子 0.6m × 1.2m，16 列 × 10 排。

## 下一步（按优先级）

1. 把 `dchall:` 自定义属性升级为 codeless applied API schema（`DataHallEquipmentAPI`、`LiquidCooledAPI`），
   产出 `schema.usda` + `plugInfo.json`，validate 脚本改为基于 schema 校验。
2. 对照 NVIDIA SimReady 规范核对 kind、单位、材质绑定要求（尚未逐条核对，不要假设已合规）。
3. 网页版支持导入自己导出的 `.usda` 子集（不追求通用 USD 解析）。
4. Unity 版：USD → JSON + glTF 的离线转换管线（Python pxr），或基于 USD C++ 的 native plugin，先做方案对比再动手。

## 数据可信度

功耗和价格来自公开报道与供应链估算，**不是 NVIDIA 官方规格**，改数值时在 catalog.json 的 note 里写来源：
- GB300 NVL72 约 132–142 kW
- Vera Rubin NVL72：Max-Q 约 190 kW、Max-P 约 230 kW（Ming-Chi Kuo，2026-01），2026 下半年出货
- Rubin Ultra Kyber：约 600 kW，144 GPU，2027 路线图
- Vera Rubin NVL72 售价约 $5–7M/柜（Tom's Hardware，2026-03）
- IB 交换柜"288 端口"是简化模型，不是真实拓扑

## 风格

- UI 文案中文，简体，句子式，不用全大写标签
- 配色语义固定：GPU 绿、冷却液青、配电铜色、网络紫
- 回答直接，不要客套
