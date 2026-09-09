# GPU quality-sample references

本轮只制作无品牌、通用双风扇 PCIe 显卡教学构型；没有声称复刻某一商品型号。模型中的尺寸、开孔、显存数量和内部结构按“可见结构 + 教学比例”处理，所有架构内部区域均明确标注为 schematic。

## 结构与尺寸依据

- NVIDIA GeForce RTX 4090 official product page: <https://www.nvidia.com/en-ph/geforce/graphics-cards/40-series/rtx-4090/>。用于确认高功耗显卡的外部长度量级和显示输出/辅助供电语境；本模型不复制 NVIDIA 外观、商标或精确布局。
- PCI-SIG PCI Express Card Electromechanical Specification Revision 6.0: <https://pcisig.com/PCIExpress/Spec/CEM/CardElectromechanical_6.0>。用于 PCIe AIC 的插槽、卡边、供电和热管理关系；完整规范属于受限工程资料，本模型仅采用公开可观察的通用关系。
- PCI-SIG PCI Express CEM overview: <https://pcisig.com/specification-overview/pci-express-cem>。用于确认 CEM add-in-card 是 ATX 体系下的机械/电气参考。

## 许可与简化

本资产由项目脚本从零生成，没有导入第三方网格、纹理或品牌素材，因此没有第三方模型再发布许可问题。上述页面只作为结构和术语参考，不作为模型素材来源。

显存封装、GPU 裸片、焊点、VRM 相位和 PCIe 金手指是可编辑教学几何；GPU/显存内部区域不是微观复刻。显卡的机型、PCB 层数、器件型号和热性能未被声明为真实产品规格。

参考整理日期：2026-09-09。
