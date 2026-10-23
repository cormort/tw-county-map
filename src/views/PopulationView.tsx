import { PopulationTrend } from '../components/PopulationTrend';
import { TownMap } from '../components/TownMap';
import { useParam } from '../hooks/useParam';
import { SubTabs, type ViewContext } from './shared';

type Sub = 'towns' | 'trend';
const SUBS: { key: Sub; label: string }[] = [
  { key: 'towns', label: '鄉鎮地圖' },
  { key: 'trend', label: '人口趨勢' },
];

/** 人口與鄉鎮：鄉鎮市區層級的地圖（人口、選舉），以及縣市歷年人口與推估 */
export function PopulationView({ data, current, onSelect }: ViewContext) {
  const [sub, setSub] = useParam<Sub>('sub', 'towns', SUBS.map((s) => s.key));
  const focus = current?.county ?? null;
  return (
    <div className="view-stack">
      <SubTabs label="人口分析" tabs={SUBS} value={sub} onChange={setSub} />
      {sub === 'towns' ? <TownMap counties={data} county={focus} onSelectCounty={onSelect} /> : <PopulationTrend counties={data} selected={focus} onSelect={onSelect} />}
    </div>
  );
}
