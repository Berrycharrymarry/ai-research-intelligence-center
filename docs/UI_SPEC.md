# 暗色GPU拆解界面

现有/hardware内局部应用样式，`.gpu-lab`命名空间；不要全局覆盖其他研究页面。优先复用已有lucide-react、i18n和Layout。保留网站导航，标题“GPU 拆解实验室 / GPU Disassembly Lab”。

## 布局

桌面≥1180px：左树260px、右信息300px、中心剩余且至少480px；顶部面包屑48px，底部控制56px。1024–1179px默认折叠右栏为drawer。平板768–1023px两侧抽屉；手机≤767px上部稳定3D视口min(60dvh,520px)、下部“零件/信息/操作”切换，使用safe-area。canvas区域高度明确定义，ResizeObserver只更新aspect/必要framing，不每次面板动画把用户视角重置。
中心是实际3D区域，不用大幅说明/装饰占走空间。渲染图库在底部可折叠；GLB下载保留但资源版本与当前manifest一致。

## 视觉tokens

背景#10141C，panel#171E29，分隔#2C3544，主文字#E8EEF6，次文字#AAB7C8；accent沿用显卡玫粉#E766AB，hover轮廓淡青#7DE0EE。选中行使用低亮粉背景+左线；hover青轮廓，selected粉轮廓，不将白壳刷成粉色。保持金属环境反射与柔和key/fill/rim。不得通过过强bloom冲掉细节，默认不启用bloom。
普通文本对比≥4.5:1，控制≥44px触摸目标，focus-visible明确。信息与状态不能只依赖颜色区分。语义模式conceptual有文字chip和图标。

## 控件与信息

- 顶部：面包屑（可返回祖先）、当前层级、装配/爆炸状态、内部示意状态。
- 左：可展开零件树、搜索中文/英文/ID、眼睛开关；region筛选不生成重复物理节点。虚拟化或按需展开160鳍片与重复接点，默认收起。树支持方向键、Enter、Home/End，使用ARIA tree/treeitem及aria-expanded。
- 右：中文名、英文名、category、parent、核心功能、位置、连接类型、层级、可信度/概念说明；显示原子件不能深入原因；主要动作“拆离观察”“展开内部/查看内部示意”。
- 底部：返回上一层、当前复原、整卡重置、爆炸开关、转动部件/环绕场景、自动旋转、X-Ray、隐藏遮挡、帮助。窄屏次要选项收进菜单。
- 自动旋转只对当前合法观察对象或根Orbit生效；用户拖动暂缓，默认关闭；切换层级重新应用目标，不让父子同时旋转。
- 隐藏选中件需在树保留可恢复入口；RESET始终可见；loader错误有retry和静态图明确说明。

## 状态可用性

loading时除返回网站外禁用模型动作；error可重试。transition中只禁用会冲突的局部按钮，BACK/RESET和最新tree intent仍可接收。leaf的“展开内部”禁用并显示leafReason，不弹无意义错误。软件技术字段（meshId、draw calls）只放debug/dev，不出现在常规用户说明。

## 验收图

必须保存实际浏览器：桌面整卡、hover选中、fan三级拆解、GPU内部示意、根爆炸、X-Ray、手机树/viewport各一张；不是设计稿。无需为截图改变设计。界面细节服从真实模型交互已通过的结果，不用UI动画掩盖三维功能缺失。
