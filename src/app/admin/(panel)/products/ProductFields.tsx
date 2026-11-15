import { Field, SelectField, TextArea } from "@/components/admin/ui";

export function ProductFields({ product, brands, categories }: {
  product?: { name: string; nameKk: string | null; slug: string; brandId: string | null; categoryId: string | null; manufacturer: string | null; descriptionRu: string | null; descriptionKk: string | null; searchAliases: string[] };
  brands: { id: string; name: string }[];
  categories: { id: string; nameRu: string; parentId: string | null }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Торговое название" name="name" required defaultValue={product?.name} />
      <Field label="Название на казахском (только подтверждённое)" name="nameKk" defaultValue={product?.nameKk} hint="Если перевода нет, оставьте пустым — покажется оригинальное название" />
      <Field label="Адрес страницы (slug)" name="slug" defaultValue={product?.slug} hint="Пусто — создать из названия" />
      <Field label="Производитель" name="manufacturer" defaultValue={product?.manufacturer} />
      <SelectField label="Бренд" name="brandId" defaultValue={product?.brandId} options={[{ value: "", label: "—" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} />
      <SelectField label="Категория" name="categoryId" defaultValue={product?.categoryId} options={[{ value: "", label: "—" }, ...categories.map((c) => ({ value: c.id, label: `${c.parentId ? "— " : ""}${c.nameRu}` }))]} />
      <TextArea label="Варианты написания для поиска (через ; )" name="searchAliases" defaultValue={product?.searchAliases.join("; ")} rows={2} className="md:col-span-2" hint="Например: paracetamol; парацетомол" />
      <TextArea label="Описание (только из подтверждённого источника)" name="descriptionRu" defaultValue={product?.descriptionRu} rows={4} hint="Не вносите показания, дозировки и противопоказания без официальной инструкции" />
      <TextArea label="Описание на казахском" name="descriptionKk" defaultValue={product?.descriptionKk} rows={4} />
    </div>
  );
}
