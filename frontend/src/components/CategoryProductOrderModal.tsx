import { useEffect, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { GripVertical, LoaderCircle, ArrowDown, ArrowUp } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { useGetCategoryProductOrderQuery, useSaveCategoryProductOrderMutation, type CategoryOrderedProduct } from '../store/api/productsApi';
import { toBackendUrl } from '../utils/url';
import { showError, showSuccess } from '../utils/notifications';

export default function CategoryProductOrderModal({ categoryId, categoryName, onClose }: { categoryId: number; categoryName: string; onClose: () => void }) {
  const { currentData: data, isFetching, isError, refetch } = useGetCategoryProductOrderQuery(categoryId, { refetchOnMountOrArgChange: true });
  const [saveOrder, { isLoading: saving }] = useSaveCategoryProductOrderMutation();
  const [products, setProducts] = useState<CategoryOrderedProduct[]>([]);
  useEffect(() => { if (data) setProducts(data.products); }, [data]);
  const changed = Boolean(data && products.some((product, index) => product.id !== data.order[index]));
  const move = (from: number, to: number) => {
    if (saving || to < 0 || to >= products.length || from === to) return;
    setProducts(previous => {
      const next = [...previous];
      const [product] = next.splice(from, 1);
      next.splice(to, 0, product);
      return next;
    });
  };
  const onDragEnd = (result: DropResult) => { if (result.destination) move(result.source.index, result.destination.index); };
  const save = async () => {
    if (!data || !changed || saving || isFetching) return;
    try {
      await saveOrder({ categoryId, product_ids: products.map(product => product.id), expected_order: data.order }).unwrap();
      showSuccess('Classement enregistré. Il sera utilisé sur le site e-commerce.');
      onClose();
    } catch (error) {
      showError((error as { data?: { message?: string } }).data?.message || 'Impossible d’enregistrer le classement.');
    }
  };
  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Classer les produits · {categoryName}</DialogTitle>
          <DialogDescription>Glissez chaque ligne à la position souhaitée, puis enregistrez. Tous les produits de cette catégorie sont affichés ici. Le site e-commerce suivra cet ordre dans le tri par catégorie.</DialogDescription>
        </DialogHeader>
        {isError ? <div role="alert" className="text-red-700">Impossible de charger les produits. <button type="button" onClick={() => void refetch()} className="underline">Réessayer</button></div>
          : isFetching ? <div className="flex items-center gap-2 py-8"><LoaderCircle className="animate-spin" /> Chargement…</div>
          : !products.length ? <p className="py-8 text-gray-500">Aucun produit stockable dans cette catégorie.</p>
          : <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="category-products">
              {provided => <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200">
                {products.map((product, index) => <Draggable key={product.id} draggableId={String(product.id)} index={index} isDragDisabled={saving}>
                  {(drag, snapshot) => <div ref={drag.innerRef} {...drag.draggableProps} className={`flex items-center gap-3 border-b border-gray-200 p-3 ${snapshot.isDragging ? 'bg-blue-50 shadow-lg' : 'bg-white'}`}>
                    <span {...drag.dragHandleProps} aria-label={`Déplacer ${product.designation}`} className="cursor-grab touch-none text-gray-400"><GripVertical size={20} /></span>
                    <span className="w-8 text-sm text-gray-500">{index + 1}</span>
                    {product.image_url && <img src={toBackendUrl(product.image_url)} alt="" className="h-10 w-10 rounded object-contain" loading="lazy" />}
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{product.designation}</p><p className="text-xs text-gray-500">Réf. {product.reference || product.id}</p></div>
                    <button type="button" aria-label={`Monter ${product.designation}`} disabled={saving || index === 0} onClick={() => move(index, index - 1)} className="p-1 disabled:opacity-30"><ArrowUp size={16} /></button>
                    <button type="button" aria-label={`Descendre ${product.designation}`} disabled={saving || index === products.length - 1} onClick={() => move(index, index + 1)} className="p-1 disabled:opacity-30"><ArrowDown size={16} /></button>
                  </div>}
                </Draggable>)}
                {provided.placeholder}
              </div>}
            </Droppable>
          </DragDropContext>}
        <DialogFooter>
          <span className="mr-auto self-center text-sm text-gray-500">{products.length} produit(s){changed ? ' · Modifications non enregistrées' : ''}</span>
          <button type="button" onClick={onClose} disabled={saving} className="rounded border px-4 py-2 disabled:opacity-40">Fermer</button>
          <button type="button" onClick={() => void save()} disabled={!changed || saving || isFetching || isError} className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-40">{saving && <LoaderCircle size={16} className="animate-spin" />} Enregistrer le classement</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
