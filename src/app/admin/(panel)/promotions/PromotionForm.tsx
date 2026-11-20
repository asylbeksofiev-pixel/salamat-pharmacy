import { AdminForm } from "@/components/admin/AdminForm";
import { CheckField, Field, SelectField, TextArea } from "@/components/admin/ui";
import { savePromotion } from "./actions";

function toLocal(d: Date | null | undefined): string {
  if (!d) return "";
  const shifted = new Date(d.getTime() + 5 * 3600_000);
  return shifted.toISOString().slice(0, 16);
}

export interface PromoFormData {
  id: string;
  slug: string;
  titleRu: string;
  titleKk: string | null;
  descriptionRu: string | null;
  descriptionKk: string | null;
  termsRu: string | null;
  termsKk: string | null;
  imageUrl: string | null;
  type: string;
  benefitValue: number | null;
  benefitUnit: string | null;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
  appliesToAllPharmacies: boolean;
  skus: string[];
  pharmacyIds: string[];
  categoryIds: string[];
}

export function PromotionForm({ promo, pharmacies, categories }: { promo?: PromoFormData; pharmacies: { id: string; addressRu: string }[]; categories: { id: string; nameRu: string; parentId: string | null }[] }) {
  return (
    <AdminForm action={savePromotion.bind(null, promo?.id ?? null)} submitLabel={promo ? "Сохранить" : "Создать"}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Название (RU)" name="titleRu" required defaultValue={promo?.titleRu} />
        <Field label="Название (KZ)" name="titleKk" defaultValue={promo?.titleKk} />
        <Field label="Slug" name="slug" defaultValue={promo?.slug} hint="Пусто — из названия" />
        <Field label="Изображение" name="imageUrl" defaultValue={promo?.imageUrl} hint="Файл из папки public/promo репозитория (например, /promo/promo-1.jpg) или адрес https:// из разрешённого источника" />
        <SelectField label="Тип выгоды" name="type" defaultValue={promo?.type ?? "DISCOUNT"} options={[{ value: "DISCOUNT", label: "Скидка (цена со скидкой должна быть внесена как цена, прежняя — как old_price)" }, { value: "BONUS", label: "Бонус (не меняет цену товара)" }, { value: "OTHER", label: "Другое (подарок, условия)" }]} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Размер выгоды" name="benefitValue" type="number" defaultValue={promo?.benefitValue} />
          <SelectField label="Единица" name="benefitUnit" defaultValue={promo?.benefitUnit} options={[{ value: "", label: "—" }, { value: "KZT", label: "₸" }, { value: "PERCENT", label: "%" }]} />
        </div>
        <Field label="Начало (время Астаны)" name="startsAt" type="datetime-local" required defaultValue={toLocal(promo?.startsAt ?? new Date())} />
        <Field label="Окончание (пусто — бессрочно)" name="endsAt" type="datetime-local" defaultValue={toLocal(promo?.endsAt)} />
        <TextArea label="Описание (RU)" name="descriptionRu" defaultValue={promo?.descriptionRu} />
        <TextArea label="Описание (KZ)" name="descriptionKk" defaultValue={promo?.descriptionKk} />
        <TextArea label="Условия и ограничения (RU)" name="termsRu" defaultValue={promo?.termsRu} />
        <TextArea label="Условия и ограничения (KZ)" name="termsKk" defaultValue={promo?.termsKk} />
        <TextArea label="Товары: артикулы, штрихкоды или slug SKU (по одному в строке)" name="skus" defaultValue={promo?.skus.join("\n")} rows={5} hint="Необязательно. Без товаров и категорий акция действует для всей сети и показывается на странице «Акции»." />
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">Категории</legend>
          <div className="max-h-40 overflow-y-auto rounded-[var(--radius-md)] border border-line p-2">
            {categories.map((c) => <CheckField key={c.id} label={`${c.parentId ? "— " : ""}${c.nameRu}`} name="categoryIds" value={c.id} defaultChecked={promo?.categoryIds.includes(c.id)} />)}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2 md:col-span-2">
          <legend className="text-sm font-medium">Аптеки</legend>
          <CheckField label="Все аптеки сети" name="appliesToAllPharmacies" defaultChecked={promo?.appliesToAllPharmacies ?? false} />
          <div className="grid max-h-48 gap-1 overflow-y-auto rounded-[var(--radius-md)] border border-line p-2 sm:grid-cols-2">
            {pharmacies.map((p) => <CheckField key={p.id} label={p.addressRu} name="pharmacyIds" value={p.id} defaultChecked={promo?.pharmacyIds.includes(p.id)} />)}
          </div>
        </fieldset>
        <SelectField label="Статус публикации" name="status" defaultValue={promo?.status ?? "DRAFT"} options={[{ value: "DRAFT", label: "Черновик" }, { value: "PUBLISHED", label: "Опубликована (показывается в период действия)" }, { value: "ARCHIVED", label: "Архив" }]} />
      </div>
    </AdminForm>
  );
}
