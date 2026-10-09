import { Component } from "react";

export default class GpuLabBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="gpu-lab-fatal"><strong>3D 交互模块无法启动</strong><p>{this.state.error.message}</p><button onClick={() => location.reload()}>重新加载</button></div>;
  }
}
