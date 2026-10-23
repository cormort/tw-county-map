/** data.gov.tw 資料集查詢 */
import { fetchRetry } from './fetch-cache.mjs';

/** 資料集的最新一份資源（依說明或網址排序取最後；pick 可篩格式） */
export async function latestResource(id, pick = () => true) {
  const r = (await (await fetchRetry(`https://data.gov.tw/api/v2/rest/dataset/${id}`)).json()).result;
  const list = r.distribution.filter(pick).sort((a, b) => `${a.resourceDescription}${a.resourceDownloadUrl}`.localeCompare(`${b.resourceDescription}${b.resourceDownloadUrl}`));
  return list.at(-1);
}
