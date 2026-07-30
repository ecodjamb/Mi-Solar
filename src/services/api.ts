export async function api<T>(path:string, options:RequestInit={}):Promise<T>{
  const response=await fetch(`/api/${path}`,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||`Error ${response.status}`);
  return data as T;
}
