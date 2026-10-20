/** 視角選單裡代表「全國」的值（不是縣市名稱） */
export const NATIONAL = '全國';

/** 國發會的區域劃分（宜蘭屬北部；澎湖、金門、連江列為外島） */
export const REGIONS: { name: string; counties: string[] }[] = [
  { name: '北部', counties: ['臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '宜蘭縣'] },
  { name: '中部', counties: ['苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣'] },
  { name: '南部', counties: ['嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣'] },
  { name: '東部', counties: ['花蓮縣', '臺東縣'] },
  { name: '外島', counties: ['澎湖縣', '金門縣', '連江縣'] },
];

/** 臺灣六個直轄市 */
export const SIX_METROS = ['臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市'];

/** 縣市下拉選單的選項，依區域用 optgroup 分組；只列 counties 裡有的縣市 */
export function CountyOptions({ counties }: { counties: string[] }) {
  return (
    <>
      {REGIONS.map((r) => {
        const list = r.counties.filter((c) => counties.includes(c));
        return list.length ? (
          <optgroup key={r.name} label={r.name}>
            {list.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </>
  );
}
