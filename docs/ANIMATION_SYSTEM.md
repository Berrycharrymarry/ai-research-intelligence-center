# 动画、坐标与空间布局

## 不变的home与单一写入者

加载后Registry冻结每个节点restLocalMatrix、restPivot、父ID、默认可见性与材质引用。Three语义树永久父子关系，不在每次ENTER/EXIT使用attach。节点的motionGroup只写相对于rest的translationOffset与inspectionQuaternion；scale始终1。附着feature的mesh随同part，不另加动画。
节点局部矩阵 M_local = T(restLocalPivot + offset_parent) × R(restRotation × inspectionQuaternion)。meshBind保持在节点pivot坐标，子节点继承父组。source有非均匀scale必须T006烘焙到副本几何；运行时遇到非均匀semantic group即报错。使用Quaternion.slerp，不插值Euler角。

世界目标点转换：parent.updateWorldMatrix(true,false)后，localTarget=parent.worldToLocal(worldTarget.clone())，offset=localTarget-restLocalPivot。世界方向用parent世界旋转的逆旋转转换并normalize，不能用worldToLocal当方向转换。Box3用于world framing前先updateMatrixWorld(true)。休眠帧也要在拾取前更新dirty transforms。
home复原采用从immutable rest直接赋值，不通过累加负位移或反复矩阵分解倒推。最终位置误差≤1e-6m、旋转误差≤1e-5rad、scale误差≤1e-6；100次进出后同标准。

## 状态与事务

```text
Snapshot = {
 phase, revision, committedPath, selectionId, hoverId,
 layout, conceptual, xray, autoRotate, inspectionMode,
 explicitVisibility, temporaryOverrides,
 frames: [{nodeId, parentCameraPose, parentInspectionPose, revealUndo}],
 pendingIntent
}
TransitionPlan = {revision, fromPose, segments[], finalPose, commitPatch, rollbackTarget}
Segment = {durationMs, easing, nodeTracks[], cameraTrack?, visibilityBoundary?}
```

clock以requestAnimationFrame时间戳为基准；窗口恢复后dt上限50ms，暂停后台render，但需要用elapsed clamp完成收敛。动画同一时刻对每个node/camera最多一个writer。commitPatch只在整条路径成功到达终点后生效；中途cancel不能把path、visibility和pose一半提交。
交互队列latest-wins：新SELECT将旧promise resolve(superseded)，采样当前pose作为新fromPose，先回最近已提交context或必要LCA，再进行新路径。RESET绕过队列、revision++，从当前pose重规划home，旧callback检查revision不再提交。用平移/旋转/相机epsilon检测终点，再精确写最终值。

## 分段轨迹与避让

服务方向以规范装配系定义：shroud/fans/cooling通常+Z，backplate -Z，io -X；board及其正面元件先让位前方散热总成后走+Z。这些向量由manifest转换至父局部，不能混用glTF原始轴。
一次detach的轨迹：
1. prerequisites依次让位（壳→fan→cooler等），每个先沿extractAxis退出已知装配接触区域。
2. 目标沿extractAxis退出父包络至clearance；最低间隙max(0.008m,0.05×父对角线)，小封装内部可降到max(0.001m,0.12×父对角线)。
3. 移至观察停车位；最终bounds与保留上下文/其他停车件留空隙。
4. 镜头与目标最后一段同步收敛。

停车位采用固定优先级+包围盒排布，不随机。候选位在当前上下文右侧(+X)，Z在上下文最前面外侧；沿Y分行，行宽由所有已停车AABB计算。候选冲突时按X或Y扩展一个目标宽度+gap，最多16候选；无合法位则扩大场景布局范围并重新frame，不能静默穿模。选择小件镜头可以独立近看，不物理放大零件。
对每段平移以10个采样pose检查加margin的AABB，最终位必须无非授权overlap。源模型已有装配接触/内含关系和壳开孔导致AABB假阳性，不能把整个parent包含盒当实心碰撞：用注册的coarse colliders与permittedContactPairs/serviceCorridors；只对已审计接触对放行起点附近，移出后不再放行。不得用“忽略整个模型碰撞”通过测试。
圆形fan穿对应外壳开孔使用已知轴向圆柱corridor；壳/散热复杂通道先让位上层，避免实现成本高的实时物理求解。叶片本身不独立飞出。

## 根层爆炸目标

初始参考offset：shroud +Z.22，三fan各+Z.14，cooling+Z.07，board0，backplate-Z.10，io-X.09（米）。正式数值由各bounds厚度+gap下限校正，保证层间不重叠。fan保持原X等距；整卡爆炸不展开其内部件。
有顺序地打开shroud/fans/cooler/backplate/io，回装顺序相反；board固定为锚。以上只属于root explodeTargets，观察态使用不同plan，二者永不同时累加。记录目标版本用于复现。

## 镜头与独立观察

frameBounds读取实际当前世界Box3角点，沿preferredView构造right/up/forward；把8角投影到镜头基，求同时满足水平/竖直FOV的最小distance，增加15%安全边距和depth；不能只用包围球导致扁平显卡很小。视口宽度是canvas扣除实际UI面板后的DOMRect，不再从window宽猜。
相机position/target平滑，up固定并避免view平行up；近远裁剪面按选件尺度与保留上下文联合范围确定，near最低1e-5m，不用固定0.01裁掉微小芯片。focus只改camera，不修改模型scale。OrbitControls在相机动画中禁用，末帧同步target、清空惯性后再启用。
观察态trackball仅旋转active node inspectionQuaternion，使用局部pivot；祖先姿态保留。部件rotate与相机orbit由inspectionMode互斥，wheel可保留。返回子件时先归其inspectionQuaternion，再offset→0，再恢复父camera，避免角度错误地插回装配。

## 默认时间与反馈

hover100ms；单件轴向拔离240ms+横移/镜头320ms；大总成600–900ms；root爆炸900–1400ms；常规easeCubicInOut。高频点击不能重置整个renderer。部件刚开始实际移动才显示“拆离中”，成功commit后显示层级。样本测试可注入fake clock直接advance，不用等待真实秒数跑100轮。

## 必测反例

旋转父风扇后再进入轴承并BACK；从GPU裸die跳到左fan；ENTER进行30%时RESET；explode进行70%时SELECT；从隐藏GPU树选中；X-Ray开关20次；窗口resize与drag中断；两次load race；100轮全部home精度。检查世界矩阵和可见性而不只看React state。
