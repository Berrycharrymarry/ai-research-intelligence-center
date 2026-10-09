# 技术架构与模块合同

本文件冻结跨任务边界；Sol可以修正实际API兼容问题，但必须更新决策记录，不重新选择框架。SITE与ASSET见PROJECT_SPEC。所有JSON version=1、米制、稳定小写点分ID，禁止用Three UUID或数组下标作为持久ID。

## 文件结构与负责人任务

资产管线（全部新增在ASSET/interactive）：

```text
scripts/build_interactive.py          T003 编排入口
scripts/semantic_groups.py            T003 唯一归属/组装父级
scripts/board_internals.py            T004 PCB/封装/VRM补建
scripts/fan_internals.py              T005 电机局部补建
scripts/export_interactive.py         T006 副本导出与roundtrip校验
specs/internal_parameters.json        T004/T005 分别只维护board/fans键
specs/assembly.json                   T002 初稿，T006 导出补齐运行时几何字段
output/interactive_gpu.blend          T006
output/gpu-disassembly.<assetVersion>.glb
output/assembly.<assetVersion>.json
reviews/<task-id>/                    每任务日志、diff、检查图
```

网站（相对SITE）：

```text
frontend/src/pages/HardwareLab.jsx              T013 集成页面
frontend/src/components/gpu-lab/
  GpuLabViewport.jsx                           T008 React生命周期适配
  PartsTree.jsx PartInfo.jsx Breadcrumbs.jsx    T013
  LabToolbar.jsx MobilePanels.jsx              T013
frontend/src/viz/gpu-lab/
  assetCatalog.js                             T006/T014 版本资源URL与哈希
  contracts.js manifestValidator.js            T002
  assetLoader.js registry.js resourcePool.js   T007
  labState.js controller.js                    T007 state / T009调度
  sceneRig.js renderLoop.js                    T008
  picking.js highlight.js                     T008
  motion.js layoutPlanner.js                  T009
  cameraRig.js inspectionRig.js               T010
  navigation.js occlusion.js                  T011
  explosion.js                                T012
  quality.js                                  T015
frontend/src/styles/gpu-lab.css                 T013/T015
frontend/public/hardware/gpu-lab/               T006生成的版本化资源
frontend/tests/gpu-lab/                        随各任务添加，T016总回归
frontend/scripts/validate-gpu-assets.mjs        T006
frontend/scripts/smoke-gpu-build.mjs            T017
reviews/gpu-lab/<task-id>/                      网站验证
tasks/STATUS.json tasks/DECISIONS.md            执行状态、变更原因
```

现有GpuViewer保留到T013路由切换，移除其无用导入在T017统一进行。旧gallery可移入折叠区。不要同时在HardwareLab挂两套renderer。backend无需改变；测试只能读取API，不触发采集/写业务数据。

## 数据合同

`AssemblyManifest`：schemaVersion、assetVersion、assetSha256、unit="m"、coordinateFrame="BLENDER_X_LENGTH_Y_HEIGHT_Z_FRONT"、rootId="gpu"、nodes、meshBindings、regions、sourceBaseline、replacementLedger。
assetVersion用显式递增版本如gpu-lab-v1-r001，不取包含自身版本字段的输出文件哈希，避免循环定义。assetSha256是最终GLB字节hash；manifest自己的hash放在生成的assetCatalog.js，不写入自己。assetCatalog同时保存两个版本化URL和两个最终hash。内容变更也生成新版本对/目录并更新catalog，再构建dist；不原地覆盖线上同URL文件。

每个 `AssemblyNode` 必须包含：

|字段|约定|
|---|---|
|id,parentId,childIds|一棵有序无环所有权树；根parentId=null|
|kind|assembly / part / region / feature|
|nameZh,nameEn,category|UI可用完整双语名|
|functionZh,functionEn,connections,locationZh|功能、连接到其他ID、所在位置；不得留TODO|
|joint|service / bonded / integral / none；connections另记录screw/solder/braze/laminate/coating/press_fit/assumed|
|evidence,sourceRefs|photo / existing_model / conceptual；对应具体本地文件或可信资料，不能仅写“查资料”|
|leafReason|无可拆child时必填；region、feature的可移动能力永远false|
|capabilities|select,detach,drill,inspectRotate；按joint和模式计算effective capabilities|
|meshIds|仅part拥有可见几何，assembly/region/feature可引用featureOwner但不重复拥有|
|restPivot,restLocalMatrix|装配坐标的枢轴/父局部绑定矩阵；16元素列主序；Blender行主序转出时明确转置|
|boundsRest|本节点与后代在规范装配坐标的min/max，导出生成，禁止手填猜测|
|motion|extractAxis父局部单位向量、clearance、parkingPriority、revealPrerequisites、preferredView、durationMs|
|featureOwner|feature所附物理part ID；其描边/显示跟随owner|
|teachingOnly|true的深层几何与动作必须显示概念标识|

`MeshBinding`：meshId、partId、sourceObjectName（可为新geometry描述）、gltfNodeName、evidence、expectedVisible、restCanonicalMatrix。唯一meshId写入Blender对象custom properties，glTF `extras`导出为userData。GLTFLoader可能因多材质产生Mesh子节点，运行时遍历extras根下所有renderable primitive归属同一meshId；不得假设“一个node永远是一个Mesh”。

生产JSON由T002定义/T006补齐，规划输入 `docs/evidence/assembly_plan.json` 不能直接当含完整几何的最终manifest。字段缺失、重复ID、孤儿、循环、归属冲突、version/hash不一致均硬失败，并显示重试与诊断消息。region引用使用独立regions数组，不能给同一物理节点第二个parent。

## 坐标与导出

源Blender始终米制 X长/Y高/Z厚。导出标准glTF Y-up一次；加载在临时 `basisRoot` 施加Rx(+π/2)一次，得到与源一致的装配坐标，scene.up和相机up=(0,1,0)。GLB extras明确 `basisConversion="gltf_yup_to_assembly_rx90"`。测试用三fan中心、+Z正面、-X挡板、-Y舌片锚点验证，避免再转一次。
加载规范化顺序固定：gltf.scene挂临时basisRoot→更新world矩阵→记录每个renderable的规范装配world矩阵→在scene下创建identity的interactionRoot和规范装配pivot树→仅在此阶段将原renderables按逆partPivotWorld×记录world矩阵迁入→移除临时GLB/basis容器（不dispose已经复用的mesh资源）。最终interactionRoot不得再继承Rx90。GLB保留的语义父级用于验证，runtime永久树按manifest一次性重建；不能一边保留glTF局部轴，一边向它写规范装配轴的offset。

在临时导出副本规范化几何：part/assembly父节点缩放=(1,1,1)，旋转基准identity；非均匀/负scale烘焙到副本几何并正确变换法线。源共享几何只按必要的同变换组复制，不能无条件拆成479份。源文件不保存更改。
新GLB保留语义EMPTY和part节点的extras；运行时仅在加载阶段一次构建稳定树。新root transform经验证后禁止动画中反复attach/reparent，避免matrix分解与世界坐标漂移。

节点pivot取其rest后代包围盒中心（小件可用明确装配轴心）；parent-child bind平移=pivotChild−pivotParent，mesh绑定=逆partPivotWorld×原规范化meshWorld。动画Group只写额外offset和inspectQuaternion，基础绑定不可改。无新增重复“观察用模型”；检查态运动的是场景内原件。

## 稳定接口

```text
validateManifest(json, assetMeta) -> {errors[], warnings[], resolvedNodes}
loadAsset(urls, signal) -> Promise<{gltf,manifest,resources}>
createRegistry(gltf, manifest, basisRoot) -> Registry
Registry.get(id); getRenderables(id); getChildren(id); resolveHit(object,instanceId?); getRest(id)
createLabController({registry,rig,clock,onSnapshot,onError}) -> Controller
Controller.dispatch(command) -> Promise<CommandResult>
Controller.tick(dtSeconds); getSnapshot(); dispose()
planTransition(snapshot, intent, registry) -> TransitionPlan
samplePlan(plan, elapsedMs) -> PoseFrame
applyPose(frame) -> void
frameBounds(boundsWorld, camera, viewport, margin) -> CameraPose
```

Command枚举：SELECT(id,source)、ENTER(id)、BACK、RESTORE_CURRENT、RESET_ALL、SET_EXPLODED(bool)、SET_CONCEPTUAL(bool)、SET_VISIBILITY(id,bool)、SET_XRAY(bool)、SET_AUTOROTATE(bool)、SET_INSPECTION_MODE(part|scene)、RETRY_LOAD。
SELECT主部件等价于先选中并请求ENTER；叶子仅选中/镜头观察，不伪造下一级。CommandResult={status:completed|superseded|rejected,revision,reason?}，不得留下永不resolve的旧Promise。
React只发command/消费不可变snapshot；Three对象引用仅在registry，React state不保存Object3D。单一RAF控制motion/相机/OrbitControls/render，不新增每按钮一套动画循环。

## 状态与资源

模式正交受约束：layout=assembled|exploded，path=[gpu,...当前节点]；exploded只允许path=[gpu]。phase=loading|idle|transition|error|disposed。conceptual独立开关；关闭时先退到最近非示意祖先并复原示意件。selection与hover不是额外运动状态。
加载超时/取消使用AbortController管理fetch；检查GLB magic、JSON MIME/hash、HTTP状态。失败不显示“可交互”，保留重试与正式图说明。离开路由取消RAF、动画、pointer、ResizeObserver、加载回调；共享geometry/material/texture用Set或引用计数只dispose一次。

材质原值与透明设置存在resourcePool；hover用轮廓pass，不改共享baseColor。X-Ray按材质策略缓存变体、alpha约.18、depthWrite=false，恢复完整opaque/opacity/depthWrite/renderOrder；高亮pass与遮挡状态不能污染原材质。以0.162版本OutlinePass/EffectComposer检查兼容，低质量可用Box3轮廓fallback但必须可辨，禁止mesh clone膨胀高亮。

测试以Node原生node:test（pure data/math/controller + Three数学）为主；无需为规划安装依赖。真实浏览器交互使用当前可用浏览器工具；若后续允许标准自动化框架，测试代码可加，但不得绕过当时工具限制。完整验收见TEST_PLAN。
