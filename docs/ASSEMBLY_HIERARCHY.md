# 装配层级与唯一几何归属

根 `gpu` 为Level0，8个Level1总成：`shroud`、`fan.01`、`fan.02`、`fan.03`、`cooling`、`board`、`backplate`、`io`。GPU封装/显存/VRM/电源/PCIe属于板上系统，放在board之下；不把焊在PCB上的芯片假设成整卡外的独立支架总成。

机器可读完整既有对象分配和计划节点见 `evidence/assembly_plan.json`，生成检查见 `evidence/planning_validation.json`。所有479个可见源对象必须且只能归属一个最深part；assembly不再重复持有其后代mesh。sourceNames精确名单在生成计划中展开，不以宽泛 startsWith 在运行时猜。新增conceptual对象使用新稳定ID，不挪用已有对象冒充芯片。

## L1 → L2 → L3及更深节点

下列 `NN` 为固定索引，不是可自由增减的未决设计。part可拥有多个不分离的mesh。feature没有可移动枢轴。

### 外壳 shroud

- `shroud.face` L2为一体面罩part（SHROUD_Face+三Aperture_Rim+全部前脸饰线/图案/三角件/前脸字）；几何装饰作为feature信息，不进一步剥离，不再增加单子件包装层充数。
- `shroud.frame` L2 → `shroud.frame.top/bottom/right` L3；顶墙携带SidePlaque与GEFORCE_RTX文字，保留实际已有三面，不补造左墙（现有IO_EndFrame归I/O）。
- `shroud.fasteners` 是导航region，四颗 `shroud.screw.01..04` 属其下，Head+Shaft一体part。region不能移动，也不算物理层级深度。
- 接缝、开孔、浅槽均为feature，点击只介绍母件特征。

### 每枚风扇 fan.01..03

- `fan.NN.rotor` L2 → `impeller` L3（9Blade+Hub+OuterRing，叶轮一体，不能单拆某Blade）、`cap` L3（Cap+该风扇装饰/标识）、`shaft` L3、`magnet` L3（新增示意磁环）。
- `fan.NN.stator` L2 → `core`、`winding` L3（新增）；绕组可包含6个独立造型共享数据，但物理拆解终止为一组绕组，不宣称实物极数。
- `fan.NN.bearing` L2 → `sleeve`、`spacer` L3（新增示意滑动支承，不标“双滚珠”或特定轴承型号）。
- `fan.NN.mount` L2 → `base` L3（由旧Motor局部派生的支承底座）、`supports` L3（必要的简化安装支撑，新conceptual，不能穿叶轮）。
- cap/impeller/shaft之间及电机内部结合实际未知，内部展开统一bonded/conceptual。三枚风扇整体从壳体拆离为service；这不把其一体叶片变成可拆片。

### 散热系统 cooling

- `cooling.bank.01/02` L2 → `cooling.fin.01.001..080` / `02.001..080` L3，复用160独立鳍片。内部展开需要bonded示意，叶子理由：单片金属鳍片；整卡爆炸时不自动爆开160片。
- `cooling.thermal` L2 → `cooling.plate`、`cooling.pipe.01..03` L3。复用接触板与三热管；密封热管为叶子，不虚构芯/液/蒸气几何。无均热板。
- 源COOLING_ROOT/FinBank EMPTY供归属审计，新语义树替代其运行时父级；不重复保留两套运动父级。

### 板上系统 board

- `board.laminate` L2 → `board.core`、`board.copper.front/back`、`board.mask.front/back` L3。新五层仅代表材料层次，不声称真实PCB层数。core包含现有EC_Tongue，舌片与板体一起移动；其搭接沿用模型并记录。
- `board.gpu` L2 → `board.gpu.die`、`substrate`、`bga`、`tim` L3。新增裸die/封装基板/焊球/导热界面示意；无CPU式金属IHS。bga是焊球群，一个part内共享球网格，演示数量非引脚定义；不提供无意义的晶体管层。
- `board.memory.01..04` L2 → 每颗 `mold`、`substrate`、`die`、`bga` L3；四颗仅为布局示意，不代表本卡真实数量、容量或位宽。逐颗可独立选取；模封壳需真实空腔或明确剖解状态，不能实心壳里重叠塞die。
- 三组示意供电单元：`board.stage.01..03` L2 → `mold/die/leadframe` L3；`board.inductor.01..03` L2 → `core/coil` L3；`board.capacitor.01..03` L2 → `can/core` L3；`board.controller` L2 → `mold/die/leadframe` L3。均conceptual，不命名实际相数或芯片料号。
- `board.power` L2 → `housing`（Housing+Latch_Base+Latch_Stop一体塑料语义）、`mount.01/02`、`contact.01..08` L3。沿用已有接触套，内部分离标bonded/示意；供电口不允许单独镜头时把PCB舌片旋转走。
- `board.pcie` 为feature导航region，不是可拔插的板上总成。`board.pcie.pads.front/back` 为表面feature各82触点，附着board.laminate；可高亮某个触点及显示索引，默认不能剥离。演示板层展开时，前后触点随对应铜层运动；EC_Tongue随core。
- `region.gpu/memory/vrm/io` 为信息筛选，不创建重复mesh或假物理父级。指向上面已有ID，不成为第二套所有权树。

### 背板 backplate

- `backplate.panel` L2，单块有孔的板为原子件。
- `backplate.screw.01..08` L2，每颗Head+Shaft作为一件，单颗螺丝为原子件。
- 这是允许的真实深度例外：L1分离到板/螺丝后已无无损内部可拆结构，不通过螺丝头杆切开或虚构背板夹层凑L3。TEST_PLAN必须将此例外作为显式leafReason检查。

### 输出与安装 io

- `io.mount` L2 → `io.bracket/endframe/support.01/support.02` L3（真实沿用模型几何；安装关系为existing_model近似）。
- `io.dp.01..03` 与 `io.hdmi.01` L2 → `.shell`（Shell+Backwall一体）、`.insulator`（Tongue）L3。接口内部为bonded示意，无需虚构接点针数/电气标准尺寸。
- 通风孔、安装孔是母件feature，不可点击拿出“空气孔洞”。

## 计划局部补建尺寸（仅conceptual，Blender装配坐标米）

统一放在 ASSET/interactive/specs/internal_parameters.json，不能改旧parameters.json。

|局部结构|固定起点与包络|
|---|---|
|PCB五层|沿用原270×110×2mm与原中心；厚度core .00189 + copper两侧各.000035 + mask两侧各.000020 = .002|
|GPU基板|中心(-.025,0)，34×34mm；BGA Z[-.01795,-.01760]，基板[-.01760,-.01705]，die[-.01705,-.01630]；TIM顶面-.016与接触板底面匹配|
|GPU die/TIM|16×18mm矩形，die .75mm，TIM .30mm；仅视觉比例|
|显存4个|XY=(-.068,±.022)、(.018,±.022)，18×12mm外包络，Z[-.01795,-.01610]；完整封装含焊球/基板/内die/中空模封，全部包含在此包络|
|功率级/电感/电容|x=.060/.078/.096；y分别.017/.004/-.011；平面包络分别6×6/8×8/直径6mm，Z[-.01795,-.0155]；高度可按散热碰撞检查降低，不能移动旧散热外观|
|控制器|XY(.075,-.028)，4×4mm，Z[-.01795,-.0165]|
|风扇内部|以每个既有风扇轴心为局部原点；在9mm电机半径及轮毂背腔内；孔/轴同心；只局部适配旧Motor与Hub背侧，保留轮毂外表面、叶片、外圈和Cap|

新增部件按参数创建实际几何，各零件的体积不能是同一完整Mesh克隆。可共享形状相同的内存/接触件几何，但每个实例必须有唯一ID、自己的变换与拾取归属。预设数量是示意预算，绝非RTX5060Ti的硬件规格。
焊球演示密度固定GPU为8×8、每颗显存6×6，均不代表真实引脚数。每个封装的整组焊球是一个原子part，可合并该part内部小球几何以减少draw calls（单球最多8经线/4纬分段），但不能把不同封装合并。绕组同理每个fan一个part包含6组线圈。其他微件只制作与解释功能有关的外形，不为隐藏电路堆叠数千对象。

若上述初值与实际eval几何冲突：只调整新增内部件的高/位置/局部motor腔，记录前后值和原因；禁止整体重建或扩大主体。分组时每颗现有螺丝两mesh不可拆开。所有源可见mesh的保留、替换、附着关系必须纳入资产diff报告。
