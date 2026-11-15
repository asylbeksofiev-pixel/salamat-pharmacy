export const ORDER_STATUSES = ["NEW", "PROCESSING", "CONFIRMED", "READY", "COMPLETED", "CANCELLED"] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

/** Allowed status changes. A request becomes an order only when an operator confirms it. */
export const ORDER_TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
  NEW: ["PROCESSING", "CONFIRMED", "CANCELLED"],
  PROCESSING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatusValue, to: OrderStatusValue): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export const ORDER_STATUS_LABELS_RU: Record<OrderStatusValue, string> = {
  NEW: "Новая",
  PROCESSING: "В обработке",
  CONFIRMED: "Подтверждена",
  READY: "Готова к выдаче",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
};
