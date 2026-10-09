# 验收与回归测试计划

每个Task有小范围测试，T016汇总；不能只依赖最后一轮人工点击。没有测过的项目标unverified，不能把状态字段passed视为真实视觉通过。

## G0 基线与资产（T001–T006）

- 源 .blend SHA=d501cad...e1d41d，旧GLB=cc13979...ecd030；保留所有Task01–11脚本、params/历史输出的哈希清单。
- 覆盖479个源可见对象：每个恰好归一个part或有显式replacementLedger；三个Disc_Blockout永远不导出。replacement允许仅PCB_Blockout、3 Motor、3 Hub局部背腔及经记录的必要新内支撑，其他几何/外形不变。
- 校验所有node唯一、无环、parent-child双向一致、region不计深度、feature不detach；所有可移动节点有实际后代几何。零件头杆/一体叶轮的源mesh归属同一个part。
- 所有八L1检查L2/L3路径；背板仅板+螺丝原子终止是显式例外。GPU/显存/VRM在board下必须有真实新几何；概念标签齐全。不能通过复制整个显卡/整块芯片Mesh到各节点冒充内部结构。
- Blender输出重开，GLB导入反查world AABB/锚点/材质；glTF+Y面在basis变换后为装配+Z、-X I/O不翻转。extras与manifest精确对应，任意一个ID缺失为失败。
- 切片/剖面检查PCB–GPU–TIM–contact plate接触链、fan内腔及显存模封腔，无非预期贯穿；完整装配正/背/侧/3/4图与s11外形对照。
- assetVersion与实际sha匹配，局部文件引用自包含；场景无灯/摄影背景进入GLB；保留共享几何，目标预算见PROJECT_SPEC。

## G1 自动数据/数学/状态（Node --test）

新增 npm scripts `test:gpu`=node --test tests/gpu-lab/*.test.mjs；纯函数/Three数学不需要浏览器DOM。假的registry使用真实导出manifest的小子树加矩阵锚点，避免“测试只重复实现”。
用显式反例覆盖：重复mesh归属、循环、孤儿、JSON与GLB版本不匹配、HTML伪GLB、负scale未烘焙、integral有detach、conceptual无说明，均应报可诊断错误。
父旋转37°后选子件：世界目标转换回父局部正确；正交/非正交camera bounds corners都在clip内；米制微件近裁剪正确。home100轮位置≤1e-6m、旋转≤1e-5rad，不能松到mm级漂移。
fake clock覆盖SELECT→BACK、ENTER30%→RESET、EXPLODE70%→SELECT、深度3→另一总成、快速随机command至少300次；最终RESET后全部matrix/显隐/material匹配home，旧promise都resolved，无stale revision commit。
revealUndo、用户隐藏、X-Ray恢复分开检查；失去焦点/路由dispose取消所有writer；load1晚于load2返回不会覆盖scene。缓存与引用计数不重复dispose共享资源。

## G2 真实交互路径（T010–T017）

|场景|具体步骤与预期|
|---|---|
|主点击|hover左fan所有零件一起高亮；拖动不是click；点击后沿+Z拔出再到观察位，背景父件仍可见|
|三层fan|gpu→fan.01→rotor→impeller；impeller不可再分；内部示意可进入stator/core/winding与bearing，检查部件各有不同几何|
|GPU遮挡|从树选board.gpu，壳/fans/cooler先让位；再进入die示意，镜头近看且不裁剪，信息明确conceptual|
|显存/VRM|四个示意memory分别可选；随机两颗包壳/基板/die不同位置；powerstage/inductor/cap/controller各有正确子件，不是克隆整块|
|散热|cooling→bank.01→fin.01.001；内部示意有钎焊说明；独立单片观察后可回原位，160片不一开始全展开|
|PCIe/原子|金手指定位与高亮，但不能把舌片从PCB拔下；螺丝Head+Shaft同时运动；孔不能作为空气零件拿出|
|接口|io→dp.01→shell/insulator；3个DP实例互不串选，shell带Backwall，HDMI独立|
|独立转动|转当前部件90°，背景世界矩阵不变；进入子级、BACK恢复父观察角，RESET精确全复原|
|爆炸|一次展开8个L1、关闭回原位，root镜头可见各层；深层按爆炸先合回再展开，取消可恢复|
|遮挡|X-Ray开关20次无残留透明；显式隐藏后树可恢复，自动让位撤销不覆盖用户hidden|
|中断|动画中点另一件、BACK、RESET；无叠加offset、卡住按钮、相机飞离或漂浮孤儿|

至少桌面Chrome/Edge或实际可用Chromium真实WebGL环境，另测390×844触屏布局和1024平板；无法获得某浏览器时明确unverified，不能伪报跨浏览器。触摸缩放须实际设备/支持触控模拟工具验证；工具不可用写限制，桌面键鼠仍是mandatory。键盘tree、回退、focus-visible和reduced-motion都检查。

## G3 视觉与性能

保存UI_SPEC列出的实际图，逐张看整卡、内部、概念标注、镜头边界、黑片/反面/过曝。冷启动缓存未命中GLB错误与重试、慢网加载、WebGL不可用、路由进入退出10次必须有结果。
在记录设备/分辨率/DPR/浏览器后，1080p normal质量60s测试：p95帧时间≤33ms，目标中位≤20ms；交互反馈≤100ms（不含网络）；GLB解析+建registry目标≤2s（下载另计）。测量renderer.info.render.calls/triangles和memory.geometries/textures；10轮mount/unmount后没有单调增长且RAF/listener=0。采样不要每帧setReactState。
超预算优先DPR cap1.5、按需帧、暂停隐页、降低shadow map/outline分辨率、按共享fin/pad合批；优化保留instanceId→partId映射和单件分离能力，不能把全资产合并成不可拾取mesh。若实现按需instancing，拆出项必须从instance隐藏且还原归回，禁止复制双份可见零件。未超性能门槛不强制引入instancing复杂度。

## G4 构建、发布与证明

在frontend运行 npm run test:gpu / npm run build；asset validator校验public与dist中的GLB/manifest哈希。静态preview可以测试/hardware，不依赖数据库；再用现有FastAPI挂载规则检查深层路由和缺文件MIME。非硬件首页/版图/文献路由做只读smoke。
T017产出reviews/gpu-lab/final_acceptance.json，列每个requirement→test→evidence路径。所有mandatory自动检查通过且实际看图后，T018提交完整dist及版本资源到现有远端，保留旧可回退提交。线上验证新bundle、GLB+JSON的200及hash、实际WebGL/深层tree、旧路由正常；push不等于上线。
本轮仅规划，不运行本节实施测试或发布。未来执行完成后记录真实测试时间、失败修复、未覆盖项；不要提前填passed。
