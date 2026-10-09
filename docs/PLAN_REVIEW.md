# 规划全局审查

2026-10-08，结论：规划交付完整；正式实现尚未开始。自动证据：evidence/planning_validation.json。此结论不表示后续模型/动画/UI已验收。

## 完整性与依赖

- 所要求的8份核心文档、ALL_TASKS、T001–T018、SOL_START_HERE均实际存在；另有STATUS、DECISIONS与源审计。
- 每个Task包含编号名称、目标、依赖、输入、输出、实现步骤、技术接口、交互行为、验收、测试和失败修复。
- 18任务有序无环；数据合同在资产导出前、动画在深层UI前、验收在发布前。所有任务pending，不能把这次审查当作实施完成。
- 479可见源对象精确唯一归属到330个计划节点中的part；无有名无几何的既有part，70个part明确要求新建/局部替换，不是复制完整mesh凑层级。
- 8个L1：shroud、三fan、cooling、board、backplate、io。除backplate原子终止例外，全部存在L2→L3；board中GPU/显存/VRM/供电具有实际计划内件。

## 消除的冲突

1. GLB原父级完全丢失：用exact source mapping和extras重建唯一装配树；不直接把当前扁平GLB当层级。
2. source独立mesh不等于可拆件：叶轮Blade/Hub/OuterRing、螺丝Head/Shaft、I/O Shell/Backwall各归一个物理part；铜触点和孔作为feature。
3. 轴转换与父局部冲突：basis只作加载临时Rx90规范化；runtime另建identity interactionRoot。不会向glTF旧局部轴写新坐标系offset。
4. 动态reparent漂移：永久语义树、immutable home、单一writer；世界目标每次换算到当前父局部；返回恢复父快照。
5. explosion和inspection位移叠加：root exploded与深层path互斥，通过同controller有序转换；RESET优先级最高。
6. 透明与隐藏污染：explicit visibility、temporary reveal、X-Ray材质变体分层；返回只撤销临时覆盖。
7. 内部真实程度：新增芯片/VRM/板层/电机均conceptual；GPU裸片封装无虚构IHS，不添加无来源均热板；背板不假造夹层。
8. board上方2mm空间不足风险：预设封装层厚度/TIM与现有接触板对齐；冲突优先改新增内件，不扩大主体。
9. assetVersion/hash循环：显式递增version；GLB hash写manifest，manifest hash写外部assetCatalog；内容变更也发新资源对。
10. 性能预算与细件数量：初始实例145,404三角形/479 draws；BGA/绕组合并只限原子part内部，宏观阴影，先测后优化，不全卡合并。
11. 网页伪成功：HTTP200可能是SPA HTML；校验GLB magic/MIME/version/hash。push之后必须看实际线上递归动作。
12. 断点续做：STATUS记录输入hash/证据/checkpoint，修改上游标下游needs_recheck；规划生成器已阻止覆盖已开始的任务状态。

## 保持与限制

重新计算源.blend与GLB哈希仍为d501cad…e1d41d和cc13979…ecd030；现有受跟踪产品文件没有变更。本轮仅新增docs/tasks与只读审计，没有写ASSET/interactive实现、修改模型或发布网站。
Windows中文路径/PowerShell、Blender5.2导出RNA、Three0.162 API、部分.runtime-deps权限和Render只服务已提交dist等限制已写入入口与Task。实际GPU性能/移动触控/浏览器兼容性只有后续实测才能定论，不能由本次规划审查宣称通过。
