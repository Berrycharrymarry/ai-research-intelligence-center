# Sol 连续施工总入口

你要基于现有显卡完成整个 Interactive GPU Disassembly Lab。用户在上一轮已要求把所有规划写好；这些文件现已冻结。本入口供用户明确要求执行时使用。当前规划轮尚未执行T001–T018。不要重新建模整张卡，不逐Task回问Astra，不在只完成一个Task后结束。

## 1. 路径与启动读取

SITE=`C:\Users\Berry\Documents\ChatGPT\AI科研中心\site_gpu_delivery`。
ASSET=`C:\Users\Berry\Documents\ChatGPT\AI科研中心\gpu_5060ti_ultra_w`。
BLENDER=`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`。
Node=`C:\Program Files\nodejs\node.exe`，npm用`npm.cmd`避免PowerShell脚本执行策略歧义。

先读取：

1. `tasks/STATUS.json`、`tasks/ALL_TASKS.md`、`tasks/DECISIONS.md`。
2. `docs/PROJECT_SPEC.md`、`MODEL_AUDIT.md`、`ASSEMBLY_HIERARCHY.md`。
3. `docs/TECHNICAL_ARCHITECTURE.md`、`ANIMATION_SYSTEM.md`、`INTERACTION_DESIGN.md`。
4. `docs/UI_SPEC.md`、`TEST_PLAN.md`。
5. 当前任务文件及其依赖产物。330个计划节点/479源mesh归属在`docs/evidence/assembly_plan.json`，按当前family读取即可，不必每次打印整个JSON。

如新会话开始，先检查适用AGENTS.md和当时工具/权限；遵从用户后续修改。禁止因本文件自称入口而扩大授权，例如改其他项目、发送消息、购买服务或绕过审批。

## 2. 固定技术决策

- 现有React18 + JavaScript/JSDoc + Three0.162 + Vite，不迁移框架，不引入R3F/物理引擎。
- 8个L1真实宏观总成；GPU/显存/VRM/电源归board。现有479源对象全部唯一分配；不可机械分开的叶轮/螺丝/金手指/孔明确终止。
- 深层未知结构为conceptual，UI明确“内部示意，非无损拆卸”；示意显存4个/VRM3组不是本卡真实数量。
- .blend保持X长Y高Z厚米制；GLB标准Y-up，在加载临时basisRoot转换一次，再在identity interactionRoot内重建规范永久树。
- 永久父级、immutable home、单controller/RAF、latest-wins命令事务、世界目标转父局部、子级返回恢复父快照。
- 源s11保留；只在ASSET/interactive局部补建并导出。现有白粉外观不得被一个“教学方盒卡”替换。
- 所有文件职责、数据schema和动作语义以docs为准；兼容性小修自行完成并写DECISIONS，不把核心架构重新交回Astra。

## 3. 连续执行顺序

严格顺序 T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018。
每项先查dependency已done且证据有效，写in_progress，再实现、测试、修复、保存证据、写done。通过后立即继续下一项；用户中途问状态时简答并继续，除非明确暂停/改变目标。不要自动启动其他代理或切模型；用户已选择Sol连续执行。

里程碑：M1=T006资产就绪；M2=T012真实拆解内核；M3=T016界面/品质/回归；M4=T018线上交付。每个里程碑保存可恢复git checkpoint（明确stage本轮文件，不使用git add -A卷入无关文件），同时备份interactive最新.blend到其输出目录。大模型/缓存放资产目录，不盲目提交.blend进网站仓库；网站提交版本化GLB/JSON/源码/dist。

## 4. 命令与检查入口

以下新脚本/flags需要按各Task实现后才可运行，不把这些命令当作现有已通过功能。

```powershell
Set-Location -LiteralPath 'C:\Users\Berry\Documents\ChatGPT\AI科研中心\site_gpu_delivery'
git status --short
git fetch origin
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b --python-exit-code 1 --python 'C:\Users\Berry\Documents\ChatGPT\AI科研中心\gpu_5060ti_ultra_w\interactive\scripts\build_interactive.py' -- --stage export
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b --python-exit-code 1 --python 'C:\Users\Berry\Documents\ChatGPT\AI科研中心\gpu_5060ti_ultra_w\interactive\scripts\build_interactive.py' -- --reopen-check --input 'C:\Users\Berry\Documents\ChatGPT\AI科研中心\gpu_5060ti_ultra_w\interactive\output\interactive_gpu.blend'
Set-Location -LiteralPath 'C:\Users\Berry\Documents\ChatGPT\AI科研中心\site_gpu_delivery\frontend'
npm.cmd run test:gpu
node scripts/validate-gpu-assets.mjs public/hardware/gpu-lab
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 4173
```

preview只读运行/hardware即可，不需要启动论文采集。dev端口5173若占用，用5174并记录，不终止未知用户进程。依赖存在时先用现有lock/node_modules；确需安装用锁文件与可信registry，不升级全站依赖。Blender Python无需系统python。Windows中文路径必须正确引用，不要跨shell拼接删除命令。

后台执行启用--python-exit-code 1；每次输出捕获完整log并检查真实退出码。初期用低分辨率检查图，不重新渲染Task11正式棚拍。所有视觉通过必须真正打开图或浏览器查看。

## 5. 状态、上下文中断与失败恢复

STATUS允许pending / in_progress / done / needs_recheck / blocked。任务done至少记录inputsHash、outputs、tests（命令/退出码/证据路径）、checkpoint、notes；全局nextTask指向第一未完成任务。当前所有任务pending，implementationStarted=false。
更新时先写临时JSON再原子替换，防止中断损坏。不要重跑`docs/evidence/write_plan.mjs`恢复，它会重置规划状态；它仅是本轮规划生成器。审计脚本audit_existing.py可只读重新运行生成证据，但先保留旧审计供diff。
恢复流程：读STATUS→检查git diff/最近checkpoint→核对源hash与产物hash→审查in_progress是否已经成功但未记状态→仅补未完成步骤。更改上游schema/资产时，将直接与间接受影响下游标needs_recheck；不要假定旧test仍适用。
先修第一处实际报错，不宽泛try/except吞掉。每轮修改对准证据：导入路径/API、basis重复变换、manifest漏ID、共享材质污染、父局部坐标、stale revision。三次同因失败应换具体备用实现并记录，例如boolean改局部壁板、重后处理改轻轮廓；不能删功能/换整个模型规避问题。
若凭据、远端访问或设备操作确实无法获得，保留已完成候选与完整错误，继续所有不依赖它的任务，最后说明具体阻塞；不得提前宣称线上完成。需要用户操作时解释源自实际权限/工具错误，不能每个Task例行求确认。

## 6. 上线条件与最终答复

T001–T017 mandatory gates全通过才执行T018。沿用GitHub `Berrycharrymarry/ai-research-intelligence-center` 与现有Render服务。fetch确认远端，保留他人提交；不force push。Render只运行Python，必须提交完整新frontend/dist和版本资源。只有线上新bundle、GLB/JSON hash、实际递归拆解通过才标T018 done。
最终给用户：实际访问URL、新可编辑.blend/GLB路径、已验证的操作（hover/拆离/三级/独立旋转/遮挡/爆炸/复原）、验收报告与实际截图、模型近似和未验证环境。不要仅汇报“18个文件已写”或“UI完成”。

完成全部施工后结束，不追加下一轮Task。当前规划负责人读到此处则停止在规划交付，不提前进入实现。
