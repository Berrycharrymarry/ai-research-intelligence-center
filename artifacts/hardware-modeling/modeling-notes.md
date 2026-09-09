# Blender hardware modeling notes

## 本轮交付范围

已完成显卡质量样板：`graphics-card.blend`、`graphics-card.glb`、正面/背面棚拍预览和 GLB manifest。CPU、主板、内存、存储、电源、散热器和机箱仍由网站原有教学资产提供，未宣称本轮已精细化。

## 工具与方法

- Blender 5.2.1 LTS Windows portable，来自 Blender 官方下载页：<https://www.blender.org/download/>。
- 建模脚本：`artifacts/hardware-modeling/scripts/build_graphics_card.py`。
- 采用真实独立 Empty 节点与子网格：PCB 轮廓、开孔、分段 PCIe 金手指、GPU 封装/基板/焊点、独立显存实例、VRM 相位、分件 shroud、连续贝塞尔热管、间隔鳍片、具有厚度和倾角的曲面扇叶、轮毂、I/O 挡板与螺丝。
- 材质采用 Blender Principled BSDF，区分 PCB、塑料、铝、银、铜、金、陶瓷和硅示意材质；无泛光和重景深。
- GLB 保留 `gpu`、`gpu-cooler`、`gpu-package`、`gpu-vram`、`gpu-power-zone`、`gpu-pcb`、`gpu-backplate`、`gpu-ports` 等节点名及独立 VRAM/风扇实例。

## 资产验收记录

脚本实际保存 `.blend`、渲染两张静帧并导出 GLB；导出后由网站的 Three.js 场景加载线上资产。manifest 在 Blender 导出阶段记录 Blender 版本、网格对象数、三角形估算和 GLB 字节数，避免手填性能数据。

网页仍由现有知识树负责路径、面包屑、聚焦、拆分、移动、复原和视频绑定。精细 GPU 资产作为质量样板接入，未完成部件继续使用旧资产，并在界面/交接中保持诚实标注。
