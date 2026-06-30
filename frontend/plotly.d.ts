declare module "react-plotly.js" {
  import { Component } from "react";
  interface PlotParams {
    data: any[];
    layout?: any;
    config?: any;
    style?: React.CSSProperties;
    className?: string;
    onClick?: (event: any) => void;
    onHover?: (event: any) => void;
  }
  export default class Plot extends Component<PlotParams> {}
}

declare module "plotly.js-basic-dist-min" {
  const Plotly: any;
  export default Plotly;
}
