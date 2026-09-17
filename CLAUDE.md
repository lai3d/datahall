# GPU Data Hall Builder

用于体验搭建 AI 数据中心的模拟器，重点是 NVIDIA 新一代 GPU 机柜（GB200/GB300 NVL72、Vera Rubin NVL72、Kyber）。
目标形态：网页版（传播和容量规划逻辑）+ Unity 版（沉浸体验、VR、托盘拆解、故障演练）。
数据格式兼容 OpenUSD，为以后接入 NVIDIA SimReady 资产和 Omniverse DSX 生态留路。

## 目录

- `web/index.html`：网页版，单文件，three.js r128（cdnjs UMD），无构建步骤
- `spec/catalog.json`：设备目录，从 index.html 的 `CATALOG` 抽出，**目标是成为唯一数据源**
- `samples/datahall.usda`：导出样例，已用 OpenUSD 26.08 验证
- `tools/validate_usd.py`：USD 校验脚本（`pip install usd-core`）

## 运行

```bash
python3 -m http.server 8080 -d web      # 打开 http://localhost:8080
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

## 已知问题（接手时先处理）

1. **导出按钮在独立部署时不可用。** 当前导出走 claude.ai artifact 的 `window.claude.use('downloads')`，
   独立打开页面时没有 `window.claude`，按钮会隐藏。需要改为：有 `window.claude` 时走 downloads，
   否则用 `Blob + URL.createObjectURL + <a download>` 直接下载 `.usda`（不必再打 zip，zip 只是为了绕过 artifact 的扩展名白名单）。
2. `CATALOG` 仍硬编码在 index.html 里，和 `spec/catalog.json` 重复。改成页面 fetch catalog.json。
3. `buildUsda` 在 index.html 的 `// USD-BEGIN` / `// USD-END` 之间，应抽成独立 ES module，便于 node 测试。

## 下一步（按优先级）

1. 修上面三个已知问题，拆成 `web/src/`（scene、sim、usd-export、ui），保持零构建或上 Vite 二选一，先问我。
2. 把 `dchall:` 自定义属性升级为 codeless applied API schema（`DataHallEquipmentAPI`、`LiquidCooledAPI`），
   产出 `schema.usda` + `plugInfo.json`，validate 脚本改为基于 schema 校验。
3. 对照 NVIDIA SimReady 规范核对 kind、单位、材质绑定要求（尚未逐条核对，不要假设已合规）。
4. 网页版支持导入自己导出的 `.usda` 子集（不追求通用 USD 解析）。
5. Unity 版：USD → JSON + glTF 的离线转换管线（Python pxr），或基于 USD C++ 的 native plugin，先做方案对比再动手。

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
