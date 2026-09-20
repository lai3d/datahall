using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace DataHall
{
    // Capacity model, ported line by line from web/src/sim.ts. Results and issue messages must match the web version,
    // checked against spec/capacity-cases.json (CapacityModelTests).
    [Serializable]
    public class CapacityIssue
    {
        public string level;   // bad or warn
        public string text;
    }

    public class CapacityResult
    {
        public double itKw, liquidHeatKw, airHeatKw, liquidCapacityKw, airCapacityKw, distributionKw, overheadKw, capexMusd, facilityKw, pue;
        public int gpus, fabricPorts;
        public bool blocking;
        public List<CapacityIssue> issues = new List<CapacityIssue>();
    }

    public static class CapacityModel
    {
        // Rack types flagged airDense in spec/catalog.json; layout.json does not carry the flag, so the ids are listed here
        static readonly HashSet<string> AirDense = new HashSet<string> { "dgx" };

        // Same as fmt in JS: >= 1000 kW shows MW with two decimals, otherwise rounds to whole kW
        public static string Format(double kw) => kw >= 1000
            ? (kw / 1000).ToString("F2", CultureInfo.InvariantCulture) + " MW"
            : Math.Floor(kw + 0.5).ToString(CultureInfo.InvariantCulture) + " kW";

        public static CapacityResult Compute(LayoutData layout)
        {
            var s = new CapacityResult();
            bool future = false;
            CatalogEntry dense = null;   // first air-cooled dense rack in the hall
            foreach (var e in layout.equipment)
            {
                var t = layout.Find(e.type);
                double kw = t.powerKw;
                s.itKw += kw;
                s.gpus += t.gpuCount;
                s.liquidHeatKw += kw * t.liquidFraction;
                s.airHeatKw += kw * (1 - t.liquidFraction);
                s.liquidCapacityKw += t.liquidCoolingKw;
                s.airCapacityKw += t.airCoolingKw;
                s.distributionKw += t.distributionKw;
                s.fabricPorts += t.fabricPorts;
                s.overheadKw += t.overheadKw;
                s.capexMusd += t.capexMusd;
                if (t.roadmap) future = true;
                if (dense == null && AirDense.Contains(e.type)) dense = t;
            }
            // Simplified teaching PUE: cooling power of liquid heat ×0.08 and air heat ×0.30, plus IT×0.05 distribution loss
            double chiller = s.liquidHeatKw * .08 + s.airHeatKw * .30;
            double losses = s.itKw * .05;
            s.facilityKw = s.itKw + s.overheadKw + chiller + losses;
            s.pue = s.itKw > 0 ? s.facilityKw / s.itKw : 0;

            void Add(string level, string text) => s.issues.Add(new CapacityIssue { level = level, text = text });
            if (s.itKw > s.distributionKw) Add("bad", $"配电不足：机柜需要 {Format(s.itKw)}，配电柜只能分配 {Format(s.distributionKw)}。加 RPP。");
            if (s.liquidHeatKw > s.liquidCapacityKw) Add("bad", $"液冷不足：{Format(s.liquidHeatKw)} 热量，CDU 只能带走 {Format(s.liquidCapacityKw)}。加 CDU。");
            if (s.airHeatKw > s.airCapacityKw) Add("bad", $"风冷不足：{Format(s.airHeatKw)} 热量，空调只能带走 {Format(s.airCapacityKw)}。加列间空调。");
            if (s.gpus > s.fabricPorts) Add("bad", $"后端网络不足：{s.gpus} 颗 GPU，只有 {s.fabricPorts} 个端口。加 IB 交换机柜。");
            if (s.facilityKw > layout.utilityMw * 1000) Add("bad", $"超出市电：设施总功耗 {Format(s.facilityKw)}，市电只有 {layout.utilityMw.ToString(CultureInfo.InvariantCulture)} MW。");
            if (future) Add("warn", "Kyber 机柜需要 800 VDC 配电，目前还只是路线图产品。");
            if (dense != null) Add("warn", $"{dense.name} 整柜约 {dense.powerKw.ToString(CultureInfo.InvariantCulture)} kW 纯风冷，现实中通常要配背板换热器。");
            s.blocking = s.issues.Any(i => i.level == "bad");
            return s;
        }
    }
}
