export async function adminApi<T=any>(token:string,path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(`/api/admin${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Не удалось выполнить запрос');
  return data;
}
export const statusLabels:Record<string,string>={new:'Новая',pending:'Ожидает',in_progress:'В работе',awaiting_client:'Ждём клиента',agreed:'Согласовано',paid:'Оплачено',completed:'Завершено',cancelled:'Отменено',refunded:'Возврат',error:'Ошибка'};
export const formatDate=(value:string)=>new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
export const formatMoney=(value:number)=>new Intl.NumberFormat('ru-RU').format(value)+' ₽';
