import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export const TOOLTIP = {
  backgroundColor: "#ffffff",
  borderColor: "#d7dde5",
  textStyle: { color: "#344054", fontSize: 11 },
};

export const AXIS_LABEL = {
  color: "#718093",
  fontSize: 10,
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
};

export const AXIS_LINE = { lineStyle: { color: "#d7dde5" } };

export const SPLIT_LINE = { lineStyle: { color: "rgba(170,183,196,0.22)" } };

export function areaGradient(color, from = 0.3, to = 0) {
  return {
    type: "linear",
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: `rgba(${color},${from})` },
      { offset: 1, color: `rgba(${color},${to})` },
    ],
  };
}

export default function Chart({ option, height = 260, className = "" }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const onResize = () => chart.resize();
    const observer = new ResizeObserver(onResize);
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.setOption(option, true);
    }
  }, [option]);

  return <div ref={ref} style={{ height }} className={className} />;
}
