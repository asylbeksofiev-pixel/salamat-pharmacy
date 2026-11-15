import { requireStaffPage } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { emailConfigured } from "@/server/orders/notify";
import { activePaymentProvider } from "@/server/payments/provider";
import { formatPhone } from "@/lib/format";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, CheckField, Field, PageHeader, SelectField, TextArea } from "@/components/admin/ui";
import { Notice } from "@/components/ui/Feedback";
import { saveSettings } from "./actions";

export const metadata = { title: "Настройки" };

export default async function SettingsPage() {
  await requireStaffPage("settings.manage");
  const s = await getSettings();
  const payment = activePaymentProvider();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Настройки" />
      <div className="grid gap-3 md:grid-cols-2">
        <Notice tone={emailConfigured() ? "success" : "info"} title="Уведомления по e-mail">{emailConfigured() ? "Настроены (SMTP_*, OPERATOR_EMAILS)." : "Не настроены. Задайте SMTP_HOST, SMTP_FROM, OPERATOR_EMAILS и др. в переменных окружения. Заявки сохраняются в базе в любом случае."}</Notice>
        <Notice tone="info" title="Онлайн-оплата">{payment.enabled ? `Провайдер: ${payment.name}` : "Не подключена. Кнопка «Оплатить» на сайте не показывается. Интерфейс провайдера: src/server/payments/provider.ts."}</Notice>
      </div>
      <AdminForm action={saveSettings} submitLabel="Сохранить настройки">
        <Card title="Справочная служба">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Телефон" name="helplinePhone" required defaultValue={formatPhone(s.helpline.phone)} />
            <Field label="Часы работы (RU)" name="helplineHoursRu" defaultValue={s.helpline.hoursRu} placeholder="ежедневно 09:00–21:00" />
            <Field label="Часы работы (KZ)" name="helplineHoursKk" defaultValue={s.helpline.hoursKk} />
            <CheckField label="Номер подтверждён SALAMAT" name="helplineVerified" defaultChecked={s.helpline.verified} />
          </div>
        </Card>
        <Card title="Компания">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Юридическое название" name="legalName" defaultValue={s.company.legalName} />
            <Field label="БИН" name="bin" required defaultValue={s.company.bin} />
            <Field label="Год основания" name="foundedYear" type="number" defaultValue={s.company.foundedYear} />
            <Field label="Юридический адрес" name="legalAddress" defaultValue={s.company.legalAddress} className="md:col-span-2" />
            <Field label="E-mail для покупателей" name="email" type="email" defaultValue={s.company.email} />
            <Field label="Лицензия на фармдеятельность (номер, дата)" name="licenseInfo" defaultValue={s.company.licenseInfo} className="md:col-span-2" />
            <CheckField label="Сведения подтверждены" name="companyVerified" defaultChecked={s.company.verified} />
          </div>
        </Card>
        <Card title="Цены, остатки и рецептурные товары">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Цена устаревает через, ч" name="priceStaleHours" type="number" defaultValue={s.offerPolicy.priceStaleHours} />
            <Field label="Остаток устаревает через, ч" name="stockStaleHours" type="number" defaultValue={s.offerPolicy.stockStaleHours} />
            <Field label="«Осталось мало» при остатке ≤" name="lowStockThreshold" type="number" defaultValue={s.offerPolicy.lowStockThreshold} />
            <SelectField label="Рецептурные препараты (подтверждённые)" name="rxPolicy" defaultValue={s.offerPolicy.rxPolicy} options={[{ value: "BLOCK", label: "Онлайн-заявка запрещена (по умолчанию)" }, { value: "PICKUP_WITH_PRESCRIPTION", label: "Заявка на самовывоз, рецепт при получении" }]} hint="Включайте заявки только после проверки требований законодательства РК юристом" className="md:col-span-2" />
            <SelectField label="Рецептурность не подтверждена" name="unknownRxPolicy" defaultValue={s.offerPolicy.unknownRxPolicy} options={[{ value: "ALLOW_WITH_NOTICE", label: "Разрешить с пометкой (фармацевт проверит)" }, { value: "BLOCK", label: "Запретить онлайн-заявку" }]} />
          </div>
        </Card>
        <Card title="Оформление заявок">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Максимум позиций в заявке" name="maxLines" type="number" defaultValue={s.checkout.maxLines} />
            <Field label="Максимум единиц одного товара" name="maxQtyPerLine" type="number" defaultValue={s.checkout.maxQtyPerLine} />
            <Field label="Версия политики для согласия" name="consentVersion" defaultValue={s.checkout.consentVersion} hint="Сохраняется в каждой заявке" />
            <CheckField label="Доставка доступна" name="deliveryEnabled" defaultChecked={s.checkout.deliveryEnabled} hint="Включайте только после утверждения зон, стоимости, сроков и оплаты" />
            <TextArea label="Условия доставки (RU)" name="deliveryTermsRu" defaultValue={s.checkout.deliveryTermsRu} rows={3} />
            <TextArea label="Условия доставки (KZ)" name="deliveryTermsKk" defaultValue={s.checkout.deliveryTermsKk} rows={3} />
          </div>
        </Card>
        <Card title="Хранение персональных данных">
          <Field label="Обезличивать контакты в завершённых/отменённых заявках через, дней" name="orderPiiDays" type="number" defaultValue={s.retention.orderPiiDays} hint="Выполняется командой npm run orders:anonymize (запускайте ежедневно по расписанию)" />
        </Card>
      </AdminForm>
    </div>
  );
}
