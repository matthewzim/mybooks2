jest.mock('../services/supabase', () => ({ supabase: { from:jest.fn(),rpc:jest.fn(),auth:{getSession:jest.fn()} },TABLES:{BOOKSHELF_ITEMS:'bookshelf_items'}, handleSupabaseError:e=>e.message }));
jest.mock('../services/isbndb',()=>({bookDedupeKey:jest.fn(),isbndbService:{}}));
const {supabase}=require('../services/supabase');
const {booksService}=require('../services/books');
beforeEach(()=>jest.resetAllMocks());
test('large shelf reads beyond 1000 rows with stable keyset pagination',async()=>{
 const rows=Array.from({length:1201},(_,n)=>({id:String(n).padStart(8,'0'),book_id:`b${n}`,position:n,book:{title:`Book ${n}`,author:'A'}}));
 const cursors=[];let page=0;
 supabase.from.mockImplementation(()=>{
  const data=rows.slice(page*500,++page*500);
  const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,gt:(_key,id)=>{cursors.push(id);return q;},then:resolve=>Promise.resolve({data,error:null}).then(resolve)};
  return q;
 });
 const result=await booksService.getBooksByShelf('shelf');
 expect(result.error).toBeNull(); expect(result.data).toHaveLength(1201);
 expect(cursors).toEqual(['00000499','00000999']);
});
test('a page failure returns an error instead of a partial library',async()=>{
 const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,then:resolve=>Promise.resolve({data:null,error:{message:'Offline'}}).then(resolve)};
 supabase.from.mockReturnValue(q);
 expect((await booksService.getBooksByShelf('shelf')).error.message).toBe('Offline');
});
test('book creation uses one transactional RPC and surfaces rollback',async()=>{
 supabase.auth.getSession.mockResolvedValue({data:{session:{user:{id:'a'}}}});
 supabase.rpc.mockResolvedValue({error:{message:'Rating invalid'}});
 const result=await booksService.createBook({shelf_id:'s',title:'Title',author:'Author',image_url:'image'});
 expect(result.error.message).toBe('Rating invalid');
 expect(supabase.rpc).toHaveBeenCalledWith('create_book_on_shelf',expect.any(Object));
 expect(supabase.from).not.toHaveBeenCalled();
});
test.each([
 ['moveBookToShelf',['i','s'],{p_item_id:'i',p_action:'move',p_target_id:'s',p_position:undefined}],
 ['stackBookOnTop',['i','t'],{p_item_id:'i',p_action:'stack',p_target_id:'t'}],
 ['unstackBook',['i'],{p_item_id:'i',p_action:'unstack'}],
 ['deleteBook',['i'],{p_item_id:'i',p_action:'delete'}],
])('%s uses one atomic RPC and surfaces failures',async(method,args,input)=>{
 supabase.rpc.mockResolvedValue({error:{message:'Transaction rolled back'}});
 expect((await booksService[method](...args)).error.message).toBe('Transaction rolled back');
 expect(supabase.rpc).toHaveBeenCalledWith('mutate_bookshelf_item',input);
 expect(supabase.from).not.toHaveBeenCalled();
});
test('missing reorder RPC cannot trigger partial fallback writes',async()=>{
 supabase.rpc.mockResolvedValue({error:{code:'PGRST202',message:'Migration required'}});
 expect((await booksService.reorderBooks('s',['a','b'])).error.message).toBe('Migration required');
 expect(supabase.from).not.toHaveBeenCalled();
});
