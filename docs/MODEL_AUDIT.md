# 现有工程实测审计

2026-10-08，使用本机 Blender 5.2.2 LTS 后台读取最终 .blend；没有保存或修改源模型。
完整逐对象 parent、matrix_world、AABB、材质、可见性与原始 GLB 节点：`evidence/model_audit.json`。复现脚本：`evidence/audit_existing.py`。

## 实测资产

|项目|结果|
|---|---|
|模型源|../gpu_5060ti_ultra_w/output/s11_lookdev/model.blend（相对 SITE）|
|源 SHA256|d501cad14e9628143dd9ebe6b0dd15a3bd73af4bd903aac7470af17031e1d41d|
|模型对象含 EMPTY|509|
|MESH/CURVE/FONT|482，其中3个旧风扇占位隐藏|
|可见模型零件|479|
|现有 GLB|2,253,692 bytes；479节点、68网格、17材质、0纹理|
|GLB SHA256|cc13979a6cd3243de78df48f53747ad731500e8ad7d66fa0b83af37425ecd030|
|GLB 父子边数量|0：已扁平化，不能直接作为递归装配树|
|GLB 唯一/按实例三角形|39,512 / 145,404|
|基础模型 primitive draws|479，未计阴影/轮廓|

GLB 来自 Task11 临时转换副本；FONT/CURVE 已网格化，Blender 源保留可编辑文字和曲线。旧 export_web 不保留 27 个 EMPTY 装配父节点，必须新建语义导出管线。三件 `FAN_0[123]_Disc_Blockout` 已从网站 GLB 排除，后续严禁回流。原 `scripts/build_s11.py` 和材质/棚拍代码保持历史归档。

## 可复用结构与缺口

|范围|已有对象|复用/改造决定|
|---|---|---|
|外壳|SHROUD 7、前脸/三开口圈/顶底右墙；DECOR 38；BRAND 8|全复用；附着饰线与文字随其承载面移动，不当独立可拆零件|
|三风扇|每组9片Blade、Hub、Cap、OuterRing、Motor、Shaft，ROOT/ROTOR|重复零件共享网格。叶片/轮毂/外圈合为语义一体叶轮；不能拆出单片叶片。电机只是实心占位，需要局部中空/定子/磁环/轴承示意|
|散热|160鳍片、2 FinBank、3 Curve 热管、ContactPlate|全部复用；鳍片与热管/接触板的连接是教学近似，内部展开标记钎焊结构示意|
|PCB|PCB_Blockout 单个270×110×2mm块|缺 GPU、显存、VRM和板层；仅在新派生文件以同包络5层示意替换该块；不用整板重新建模|
|GPU/显存/VRM|没有对应模型对象|局部补建，全部 conceptual；不得宣称实际芯片尺寸、显存数量/容量、供电相数|
|PCIe|EC_Tongue、164 EC_Pad、2 EMPTY|复用；铜触点属于板上的镀铜特征，舌片不是可拔下的小板|
|机械件|MECH_Backplate、12颗螺丝，每颗 Head+Shaft|每颗螺丝两 Mesh 必须一起运动；不能把头杆分离充数|
|视频I/O|20对象含4接口EMPTY；3 DP风格+1 HDMI风格，各Shell/Tongue/Backwall，Bracket、EndFrame、Support×2|复用；Shell+Backwall组成端口金属件，Backwall不能当独立装配件；布局沿用历史模型近似|
|供电|PWR_Housing、Contact×8、Latch_Base/Stop、Mount×2|复用，Housing/Latch按一体塑料件，8接触套可在内部示意中逐个观察；不是已证实厂商安装结构|

## 关键位置（Blender/最终装配坐标，米）

- PCB AABB：X[-.130,.140]，Y[-.059,.051]，Z[-.020,-.018]。
- 接触板：X[-.052,.002]，Y[-.042,.042]，Z[-.016,-.0115]。
- PCB正面到接触板底面只剩2mm；不能直接塞入常见大尺寸芯片占位导致穿模。新增封装必须在此空间内参数化设计。
- 背板：Z[-.025,-.020]，与现有PCB后表面接近/接触；这是既有简化，不添加不存在的背面芯片。
- Fan01 Hub：X中心-.098、半径.012，Z[.0155,.022]；Motor半径.009、Z[.013,.015]；Shaft半径.003、Z[.015,.0165]。内腔适配只允许改电机占位和轮毂背面不可见局部。
- 前面罩Z[.018,.024]；电源占位X[-.034,-.016]、Y[.0602,.066]、Z[.014,.024]；尺寸偏理想化，沿用并注释近似。
- 世界米制：X长度、Y高度、Z厚度；+Z风扇，-X I/O，-Y金手指。
- 现有GLB轴：风扇+Y、顶边-Z；网站 root 绕X+90°后回到上述装配坐标。只能转一次。

## 现有网站与运行环境

SITE 当前 master=7cf951b，审计前工作树干净。`frontend/src/pages/HardwareLab.jsx` 是单模型查看器；`frontend/src/viz/hardware/GpuViewer.jsx` 用 GLTFLoader + OrbitControls + RoomEnvironment，已有缩放/旋转/复位/下载与失败图片，无拾取、语义树、动画状态系统。
包锁及本地依赖实际 Three.js 0.162.0；Node `C:\Program Files\nodejs\node.exe` v24.19.0；Blender `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` 5.2.2 LTS。Vite dev端口5173，API代理127.0.0.1:8000。现有package scripts只有dev/build/preview，无自动测试框架。
Render已有Python单服务，FastAPI服务已提交的frontend/dist；远端不会自动执行npm build。HTML fallback可能使缺失.glb返回200 HTML，加载器必须校验类型/魔数，不能只看HTTP200。
`.runtime-deps` 有部分目录访问被拒；不依赖或反复扫描该目录。优先系统Node与现有node_modules，Blender内置Python足以生成资产。Windows有中文路径，命令使用LiteralPath和参数数组，避免字符串拼接命令。

## 技术依据

本地 `frontend/node_modules/three/src/core/Object3D.js` 明确 attach不支持非均匀缩放父链；GLTFLoader.js将extras写入userData。规划以锁定版本的本地实现为准。
官方参考：[Object3D](https://threejs.org/docs/pages/Object3D.html)、[矩阵变换](https://threejs.org/manual/pages/matrix-transformations.html)、[Blender glTF 手册](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)。文档不同版本只作机制参考，Blender5.2 exporter参数须读取本地RNA验证。
