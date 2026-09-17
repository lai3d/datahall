// 故障演练和 N+1 冗余检查。纯函数，不依赖 DOM。
// 故障设备直接从计算里拿掉：不再提供容量，也不再耗电；其余设备按 supplyLinks 重新就近分配。
import {compute} from './sim.js';
import {supplyLoads, reportedOverloads} from './supply.js';

// 可以标记故障的设施：提供液冷、配电、风冷或网络端口的设备（GPU 机柜和存储柜不算）
export const canFail = t => !!(t && (t.liqCool || t.dist || t.airCool || t.ports));

// 不满足容量检查的原因，和界面上“不能通电”的条件一一对应：
// {kind: 'dist' | 'liquid' | 'air' | 'network' | 'utility'} 或 {kind: 'overload', item}
export function blockingReasons(list, CAT, utility){
  const s = compute(list, CAT, utility);
  const reasons = [];
  if (s.it > s.dist) reasons.push({kind: 'dist'});
  if (s.liqHeat > s.liqCap) reasons.push({kind: 'liquid'});
  if (s.airHeat > s.airCap) reasons.push({kind: 'air'});
  if (s.gpus > s.ports) reasons.push({kind: 'network'});
  if (s.facility > utility * 1000) reasons.push({kind: 'utility'});
  const loads = supplyLoads(list, CAT);
  for (const kind of ['cdu', 'rpp']) reportedOverloads(loads, s, kind).forEach(([item]) => reasons.push({kind: 'overload', item}));
  return reasons;
}

// 依次让每台可故障设施单独故障，返回会让机房不满足容量检查的设备 [{item, reasons}]（按排、列排序）。
// 布局本身就不满足容量检查时返回 null：这时谈不上冗余
export function singlePointsOfFailure(list, CAT, utility){
  if (blockingReasons(list, CAT, utility).length) return null;
  return list.filter(i => canFail(CAT[i.type]))
    .map(item => ({item, reasons: blockingReasons(list.filter(i => i !== item), CAT, utility)}))
    .filter(r => r.reasons.length)
    .sort((a, b) => (a.item.z - b.item.z) || (a.item.x - b.item.x));
}
