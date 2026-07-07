import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  createPayment,
  exportUrl,
  fetchAnalyses,
  fetchMe,
  fetchUnitEconomics,
  importUnitEconomics,
  loginAccount,
  logoutAccount,
  registerAccount,
  saveUnitEconomics,
  uploadAnalysis,
  uploadImageAnalysis,
} from "./lib/api";
import type {
  Analysis,
  Payment,
  ReportType,
  Totals,
  UnitEconomics,
  User,
} from "./types/analytics";

type Page = "home" | "subscription" | "account";
type AuthMode = "login" | "register";

const emptyTotals: Totals = {
  revenue: 0,
  orders: 0,
  adSpend: 0,
  margin: 0,
  impressions: 0,
  clicks: 0,
  carts: 0,
  stock: 0,
  promoRevenue: 0,
  costTotal: 0,
  commissionTotal: 0,
  acquiringTotal: 0,
  logisticsTotal: 0,
  taxTotal: 0,
};

function emptyAnalysis(): Analysis {
  return {
    id: "",
    fileName: "",
    createdAt: new Date().toISOString(),
    reportTypes: [],
    rows: [],
    totals: emptyTotals,
    strategy: {
      source: "rules",
      headline: "",
      focusProducts: [],
      risks: [],
      actions: [],
    },
    quality: {
      score: 0,
      recognizedReports: [],
      missingReports: [],
      warnings: [],
      suggestions: [],
    },
  };
}

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}
function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
function formatUnits(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    value,
  );
}
const reportTypeLabels: Record<ReportType, string> = {
  sales: "Продажи",
  ads: "Реклама",
  stocks: "Остатки",
  promotions: "Акции/промо",
  unknown: "Не распознано",
};
function reportTypesLabel(types: ReportType[]) {
  return types.map((type) => reportTypeLabels[type] ?? type).join(", ");
}

const subscriptionPlans = [
  {
    id: "start",
    name: "Старт",
    price: "990 ₽",
    term: "1 месяц",
    description: "Для разовой проверки магазина и первых тестов.",
    features: [
      "до 10 анализов отчётов",
      "экспорт PDF/XLSX",
      "история последних анализов",
    ],
  },
  {
    id: "pro",
    name: "Профи",
    price: "2 490 ₽",
    term: "3 месяца",
    description: "Для регулярной работы с Ozon/WB и еженедельных решений.",
    features: [
      "до 50 анализов в месяц",
      "AI-стратегия по товарам",
      "приоритет новых функций",
    ],
  },
  {
    id: "business",
    name: "Бизнес",
    price: "7 900 ₽",
    term: "12 месяцев",
    description: "Для постоянного ведения магазина и команды.",
    features: [
      "безлимитные отчёты",
      "расширенная история",
      "поддержка внедрения",
    ],
  },
];
function buildMetricInsights(total: Totals, reportTypes: ReportType[]) {
  const loaded = new Set(reportTypes);
  const costs =
    total.costTotal +
    total.commissionTotal +
    total.acquiringTotal +
    total.logisticsTotal +
    total.taxTotal;
  const ddrRate = total.adSpend / Math.max(total.revenue, 1);
  const marginRate = total.margin / Math.max(total.revenue, 1);
  const costRate = costs / Math.max(total.revenue, 1);
  const insights: string[] = [];

  if (total.revenue > 0)
    insights.push(
      `Продажи составили ${money(total.revenue)} при ${formatUnits(total.orders)} заказах.`,
    );
  else
    insights.push(
      "Продажи не найдены — загрузите отчёт продаж или проверьте распознавание колонок.",
    );

  if (total.stock > 0)
    insights.push(
      `Остатки: ${formatUnits(total.stock)} шт. Значение округлено для удобного чтения.`,
    );
  else
    insights.push(
      "Остатки не найдены — без них нельзя оценить риск out-of-stock.",
    );

  if (!loaded.has("ads") || total.adSpend === 0) {
    insights.push(
      "Анализ ДДР: ДДР равен 0%, потому что рекламные расходы не загружены или равны нулю. Чтобы оценить эффективность рекламы, добавьте рекламный отчёт.",
    );
  } else if (ddrRate <= 0.1) {
    insights.push(
      `Анализ ДДР: ${percent(ddrRate)} — рекламная нагрузка низкая. Можно осторожно масштабировать товары с хорошей маржей и остатками.`,
    );
  } else if (ddrRate <= 0.25) {
    insights.push(
      `Анализ ДДР: ${percent(ddrRate)} — нагрузка умеренная. Проверьте, сохраняется ли маржа после себестоимости и комиссий.`,
    );
  } else {
    insights.push(
      `Анализ ДДР: ${percent(ddrRate)} — высокая рекламная нагрузка. Нужно снижать ставки/чистить кампании или повышать конверсию.`,
    );
  }

  if (costs === 0 && total.revenue > 0) {
    insights.push(
      "Анализ себестоимости+комиссий: показатель равен 0 ₽. Это не значит, что расходов нет — скорее не загружен справочник юнит-экономики или комиссии не сопоставились по SKU.",
    );
  } else {
    insights.push(
      `Анализ себестоимости+комиссий: ${money(costs)} (${percent(costRate)} от продаж). Чем выше эта доля, тем меньше пространство для рекламы и скидок.`,
    );
  }

  if (total.margin === 0 && total.revenue > 0) {
    insights.push(
      "Анализ маржи: маржа сейчас 0 ₽, потому что не хватает себестоимости/комиссий/эквайринга/логистики для корректного расчёта. После загрузки юнит-экономики маржа пересчитается автоматически.",
    );
  } else if (marginRate < 0) {
    insights.push(
      `Анализ маржи: ${money(total.margin)} / ${percent(marginRate)} — продажи убыточны. Нужно проверить рекламу, комиссии, скидки и себестоимость.`,
    );
  } else if (marginRate < 0.15) {
    insights.push(
      `Анализ маржи: ${money(total.margin)} / ${percent(marginRate)} — маржа низкая. Масштабировать рекламу рискованно без оптимизации расходов.`,
    );
  } else if (marginRate < 0.3) {
    insights.push(
      `Анализ маржи: ${money(total.margin)} / ${percent(marginRate)} — маржа рабочая, но перед ростом рекламы стоит контролировать ДДР.`,
    );
  } else {
    insights.push(
      `Анализ маржи: ${money(total.margin)} / ${percent(marginRate)} — хороший запас маржи, можно искать точки масштабирования при достаточных остатках.`,
    );
  }

  if (loaded.has("unknown"))
    insights.push(
      "Есть нераспознанные листы — часть данных может не участвовать в расчётах.",
    );

  return insights;
}

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis>(emptyAnalysis);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [units, setUnits] = useState<UnitEconomics[]>([]);
  const [draftUnit, setDraftUnit] = useState<UnitEconomics>({
    sku: "",
    name: "",
    cost: 0,
    commission: 0,
    acquiring: 0,
    logistics: 0,
    tax: 0,
  });
  const [loading, setLoading] = useState(false);
  const [serverMessage, setServerMessage] = useState(
    "Готова обработать отчёты Ozon/WB",
  );
  const [page, setPage] = useState<Page>("home");
  const [scrollAfterUpload, setScrollAfterUpload] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentLoading, setPaymentLoading] = useState("");
  const resultsRef = useRef<HTMLElement | null>(null);

  const rows = analysis.rows;
  const total = analysis.totals;
  const strategy = analysis.strategy;
  const quality = analysis.quality;
  const ddr = total.adSpend / Math.max(total.revenue, 1);
  const marginRate = total.margin / Math.max(total.revenue, 1);
  const ctr = total.clicks / Math.max(total.impressions, 1);
  const cartConversion = total.carts / Math.max(total.clicks, 1);
  const orderConversion = total.orders / Math.max(total.carts, 1);
  const latestAnalyses = useMemo(() => history.slice(0, 8), [history]);
  const metricInsights = useMemo(
    () => buildMetricInsights(total, analysis.reportTypes),
    [total, analysis.reportTypes],
  );
  const hasUploadedAnalysis = Boolean(analysis.id);

  async function refresh() {
    const [loadedHistory, loadedUnits] = await Promise.all([
      fetchAnalyses(),
      fetchUnitEconomics(),
    ]);
    setHistory(loadedHistory);
    setUnits(loadedUnits);
  }

  useEffect(() => {
    refresh().catch(() =>
      setServerMessage(
        "Backend не запущен — загрузка отчётов временно недоступна",
      ),
    );
  }, []);
  useEffect(() => {
    fetchMe()
      .then((data) => {
        if (data) {
          setUser(data.user);
          setPayments(data.payments);
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!scrollAfterUpload || !hasUploadedAnalysis) return;
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      setScrollAfterUpload(false);
    });
  }, [scrollAfterUpload, hasUploadedAnalysis, analysis.id]);

  async function onFileUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const spreadsheetExtensions = [".csv", ".xlsx", ".xls", ".ods"];
    const imageExtensions = [".png", ".jpg", ".jpeg", ".webp"];
    const spreadsheetFiles = files.filter((file) =>
      spreadsheetExtensions.some((extension) =>
        file.name.toLowerCase().endsWith(extension),
      ),
    );
    const imageFiles = files.filter((file) =>
      imageExtensions.some((extension) =>
        file.name.toLowerCase().endsWith(extension),
      ),
    );
    const unsupportedFiles = files.filter(
      (file) => !spreadsheetFiles.includes(file) && !imageFiles.includes(file),
    );
    if (unsupportedFiles.length) {
      setServerMessage(
        `Можно загрузить таблицы CSV, XLSX, XLS, ODS или изображения PNG, JPG, WEBP. Уберите файл: ${unsupportedFiles.map((file) => file.name).join(", ")}`,
      );
      return;
    }
    if (spreadsheetFiles.length && imageFiles.length) {
      setServerMessage(
        "Загрузите отдельно: либо таблицы для расчётов, либо одно изображение для AI-разбора.",
      );
      return;
    }
    if (imageFiles.length > 1) {
      setServerMessage("Для AI-разбора загрузите одно изображение за раз.");
      return;
    }
    setLoading(true);
    setServerMessage(
      imageFiles.length
        ? "Отправляю изображение на AI-анализ…"
        : files.length === 1
          ? "Загружаю файл и нормализую отчёт…"
          : `Загружаю ${files.length} файлов и собираю единый анализ…`,
    );
    try {
      const result = imageFiles.length
        ? await uploadImageAnalysis(imageFiles[0])
        : await uploadAnalysis(files);
      setAnalysis(result.analysis);
      setScrollAfterUpload(true);
      await refresh();
      setServerMessage(
        result.analysis.rows.length
          ? `Готово: ${files.length} файл(ов), типы отчётов — ${reportTypesLabel(result.analysis.reportTypes)}`
          : "Готово: изображение проанализировано AI",
      );
    } catch (error) {
      setServerMessage(
        error instanceof Error
          ? error.message
          : "Не получилось обработать файл. Проверьте backend и формат файла.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function importUnits(file: File | null) {
    if (!file) return;
    const result = await importUnitEconomics(file);
    setUnits(result.items);
    setServerMessage(`Импортировано SKU: ${result.imported}`);
  }

  async function addUnit() {
    if (!draftUnit.sku) return;
    const updated = await saveUnitEconomics([draftUnit]);
    setUnits(updated);
    setDraftUnit({
      sku: "",
      name: "",
      cost: 0,
      commission: 0,
      acquiring: 0,
      logistics: 0,
      tax: 0,
    });
    setServerMessage("Справочник юнит-экономики обновлён");
  }
  async function submitAuth() {
    try {
      const result =
        authMode === "register"
          ? await registerAccount(authEmail, authPassword, authName)
          : await loginAccount(authEmail, authPassword);
      setUser(result.user);
      const me = await fetchMe();
      setPayments(me?.payments || []);
      setServerMessage(
        authMode === "register"
          ? "Аккаунт создан. Можно покупать подписку."
          : "Вы вошли в аккаунт.",
      );
      setPage("account");
    } catch (error) {
      setServerMessage(
        error instanceof Error ? error.message : "Не получилось войти",
      );
    }
  }

  async function logout() {
    await logoutAccount();
    setUser(null);
    setPayments([]);
    setServerMessage("Вы вышли из аккаунта");
  }

  async function buyPlan(plan: string) {
    if (!user) {
      setPage("account");
      setServerMessage(
        "Сначала зарегистрируйтесь или войдите — потом откроется оплата.",
      );
      return;
    }
    setPaymentLoading(plan);
    try {
      const result = await createPayment(plan);
      setPayments((items) => [result.payment, ...items]);
      if (result.payment.confirmationUrl)
        window.location.href = result.payment.confirmationUrl;
      else
        setServerMessage(
          "Платёж создан, но ссылка на оплату не пришла от ЮKassa.",
        );
    } catch (error) {
      setServerMessage(
        error instanceof Error ? error.message : "Не получилось создать платёж",
      );
    } finally {
      setPaymentLoading("");
    }
  }

  const uploadPage = (
    <>
      <section className="hero-panel">
        <div>
          <p className="eyebrow">AI-платформа для продавцов маркетплейсов</p>
          <h1>Стратег для маркетплейсов</h1>
          <p className="hero-text">
            Загружаете один или несколько отчётов Ozon/WB — система объединяет
            продажи, рекламу, остатки и акции, считает маржу и готовит
            стратегию.
          </p>
          <div className="hero-actions">
            <label className="upload-button">
              {loading ? "Анализирую…" : "Загрузить отчёты"}
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.ods,.png,.jpg,.jpeg,.webp"
                disabled={loading}
                onChange={(event) => onFileUpload(event.target.files)}
              />
            </label>
            <button
              className="plain-button"
              onClick={() => setPage("subscription")}
            >
              Посмотреть подписку
            </button>
            {hasUploadedAnalysis && (
              <span className="file-name">Источник: {analysis.fileName}</span>
            )}
          </div>
          <p className="server-message">{serverMessage}</p>
          <div className="upload-hint">
            <strong>Можно загрузить пачкой:</strong>
            <span>
              продажи + реклама + остатки + акции. Файлы объединятся в один
              отчёт по SKU.
            </span>
          </div>
        </div>
        <aside className="strategy-card">
          {hasUploadedAnalysis ? (
            <>
              <span>
                Стратегия месяца · {strategy.source === "ai" ? "AI" : "rules"}
              </span>
              <strong>{strategy.headline}</strong>
              <div className="export-actions">
                <a href={exportUrl(analysis.id, "xlsx")}>XLSX</a>
                <a href={exportUrl(analysis.id, "pdf")}>PDF</a>
              </div>
            </>
          ) : (
            <>
              <span>Начните с загрузки отчётов</span>
              <strong>
                После загрузки здесь появятся стратегия, выводы и экспорт.
              </strong>
            </>
          )}
          <div className="hero-price-list">
            <p>Подписка</p>
            {subscriptionPlans.map((plan) => (
              <button key={plan.name} onClick={() => setPage("subscription")}>
                <span>
                  {plan.name} · {plan.term}
                </span>
                <strong>{plan.price}</strong>
              </button>
            ))}
          </div>
        </aside>
      </section>
      <section className="panel home-pricing-panel">
        <div className="panel-header">
          <h2>Тарифы подписки</h2>
          <p>
            Цены видны сразу на главной. Отдельная страница «Подписка» тоже
            остаётся в верхнем меню.
          </p>
        </div>
        <div className="pricing-grid compact-pricing">
          {subscriptionPlans.map((plan) => (
            <article className="price-card" key={plan.name}>
              <div>
                <span>{plan.term}</span>
                <h2>{plan.name}</h2>
                <strong>{plan.price}</strong>
                <p>{plan.description}</p>
              </div>
              <ul className="insight-list">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <button onClick={() => buyPlan(plan.id)}>
                {paymentLoading === plan.id ? "Создаю оплату…" : "Купить"}
              </button>
            </article>
          ))}
        </div>
      </section>
      {hasUploadedAnalysis && (
        <>
          <section ref={resultsRef} className="metrics-grid">
            <article>
              <span>Продажи</span>
              <strong>{money(total.revenue)}</strong>
            </article>
            <article>
              <span>Маржа</span>
              <strong>{money(total.margin)}</strong>
              <small>{percent(marginRate)}</small>
            </article>
            <article>
              <span>ДДР</span>
              <strong>{percent(ddr)}</strong>
            </article>
            <article>
              <span>Остатки</span>
              <strong>{formatUnits(total.stock)}</strong>
            </article>
            <article>
              <span>Себестоимость+комиссии</span>
              <strong>
                {money(
                  total.costTotal +
                    total.commissionTotal +
                    total.acquiringTotal +
                    total.logisticsTotal +
                    total.taxTotal,
                )}
              </strong>
            </article>
            <article>
              <span>Типы отчётов</span>
              <strong>{reportTypesLabel(analysis.reportTypes)}</strong>
            </article>
            <article>
              <span>Показ → клик</span>
              <strong>{percent(ctr)}</strong>
            </article>
            <article>
              <span>Клик → корзина</span>
              <strong>{percent(cartConversion)}</strong>
            </article>
            <article>
              <span>Корзина → заказ</span>
              <strong>{percent(orderConversion)}</strong>
            </article>
          </section>
          <section className="panel metric-analysis-panel">
            <div className="panel-header">
              <h2>Анализ метрик</h2>
              <p>
                Автоматические выводы по карточкам выше: что уже видно и каких
                данных не хватает.
              </p>
            </div>
            <ul className="insight-list">
              {metricInsights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          </section>
          <section className="content-grid">
            <div className="panel quality-panel">
              <div className="panel-header">
                <h2>Качество данных</h2>
                <p>
                  Проверка перед стратегией: что распознано и чего не хватает.
                </p>
              </div>
              <div className="quality-score">
                <strong>{quality.score}</strong>
                <span>/100</span>
              </div>
              <div className="quality-tags">
                <span>
                  Найдено:{" "}
                  {quality.recognizedReports.length
                    ? reportTypesLabel(quality.recognizedReports)
                    : "нет"}
                </span>
                <span>
                  Не хватает:{" "}
                  {quality.missingReports.length
                    ? reportTypesLabel(quality.missingReports)
                    : "нет"}
                </span>
              </div>
              <ul className="insight-list">
                {quality.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              {quality.suggestions.length > 0 && (
                <ol className="action-list quality-actions">
                  {quality.suggestions.map((suggestion) => (
                    <li key={suggestion}>{suggestion}</li>
                  ))}
                </ol>
              )}
            </div>
            <div className="panel wide">
              <div className="panel-header">
                <h2>ТОП товаров</h2>
                <p>Продажи, ДДР, маржа, остатки и расходы по справочнику.</p>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Товар</th>
                      <th>Категория</th>
                      <th>Продажи</th>
                      <th>ДДР</th>
                      <th>Маржа</th>
                      <th>Остаток</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows]
                      .sort((a, b) => b.revenue - a.revenue)
                      .map((row) => (
                        <tr key={row.sku}>
                          <td>
                            <strong>{row.name}</strong>
                            <small>{row.sku}</small>
                          </td>
                          <td>{row.category}</td>
                          <td>{money(row.revenue)}</td>
                          <td>
                            {percent(row.adSpend / Math.max(row.revenue, 1))}
                          </td>
                          <td>{money(row.margin)}</td>
                          <td>{formatUnits(row.stock)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <h2>Справочник юнит-экономики</h2>
              <div className="unit-form">
                <input
                  placeholder="SKU"
                  value={draftUnit.sku}
                  onChange={(e) =>
                    setDraftUnit({ ...draftUnit, sku: e.target.value })
                  }
                />
                <input
                  placeholder="Название"
                  value={draftUnit.name}
                  onChange={(e) =>
                    setDraftUnit({ ...draftUnit, name: e.target.value })
                  }
                />
                <input
                  placeholder="Себестоимость"
                  type="number"
                  value={draftUnit.cost}
                  onChange={(e) =>
                    setDraftUnit({ ...draftUnit, cost: Number(e.target.value) })
                  }
                />
                <input
                  placeholder="Комиссия"
                  type="number"
                  value={draftUnit.commission}
                  onChange={(e) =>
                    setDraftUnit({
                      ...draftUnit,
                      commission: Number(e.target.value),
                    })
                  }
                />
                <input
                  placeholder="Эквайринг"
                  type="number"
                  value={draftUnit.acquiring}
                  onChange={(e) =>
                    setDraftUnit({
                      ...draftUnit,
                      acquiring: Number(e.target.value),
                    })
                  }
                />
                <button onClick={addUnit}>Сохранить SKU</button>
                <label className="mini-upload">
                  Импорт XLSX
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,.ods"
                    onChange={(e) => importUnits(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <small>Записей: {units.length}</small>
            </div>
            <div className="panel">
              <h2>Риски</h2>
              <ul className="insight-list">
                {strategy.risks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </div>
            <div className="panel">
              <h2>Рекомендации на месяц</h2>
              <ol className="action-list">
                {strategy.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ol>
            </div>
            <div className="panel">
              <h2>История в памяти сервера</h2>
              <ul className="history-list">
                {latestAnalyses.map((item) => (
                  <li key={item.id}>
                    <button onClick={() => setAnalysis(item)}>
                      {item.fileName}
                      <small>{reportTypesLabel(item.reportTypes)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </>
  );

  const subscriptionPage = (
    <section className="subscription-page">
      <div className="subscription-hero panel">
        <p className="eyebrow">Подписка</p>
        <h1>Выберите срок доступа</h1>
        <p className="hero-text">
          Простая страница тарифов для MVP: цена, срок подписки и что получает
          клиент. Кнопки создают платёж ЮKassa и переводят клиента на защищённую
          страницу оплаты.
        </p>
      </div>
      <div className="pricing-grid">
        {subscriptionPlans.map((plan) => (
          <article className="price-card" key={plan.name}>
            <div>
              <span>{plan.term}</span>
              <h2>{plan.name}</h2>
              <strong>{plan.price}</strong>
              <p>{plan.description}</p>
            </div>
            <ul className="insight-list">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button onClick={() => buyPlan(plan.id)}>
              {paymentLoading === plan.id
                ? "Создаю оплату…"
                : "Оплатить через ЮKassa"}
            </button>
          </article>
        ))}
      </div>
      <section className="panel subscription-note">
        <h2>Оплата уже подключена на уровне API</h2>
        <p>
          Для боевого режима осталось добавить в окружение ключи ЮKassa и
          webhook подтверждения успешной оплаты.
        </p>
      </section>
    </section>
  );

  const accountPage = (
    <section className="account-page panel">
      <p className="eyebrow">Личный кабинет</p>
      <h1>Аккаунт и доступ</h1>
      {user ? (
        <div className="account-grid">
          <div className="account-box">
            <h2>{user.name || "Пользователь"}</h2>
            <p>{user.email}</p>
            <p>
              Статус подписки: <strong>{user.subscriptionStatus}</strong>
            </p>
            <button className="plain-button" onClick={logout}>
              Выйти
            </button>
          </div>
          <div className="account-box">
            <h2>Платежи</h2>
            {payments.length ? (
              <ul className="history-list">
                {payments.map((payment) => (
                  <li key={payment.id}>
                    <button>
                      <strong>{payment.plan}</strong>
                      <small>
                        {money(payment.amount)} · {payment.status}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Платежей пока нет. Выберите тариф на странице подписки.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="auth-panel">
          <div className="auth-tabs">
            <button
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
            >
              Вход
            </button>
            <button
              className={authMode === "register" ? "active" : ""}
              onClick={() => setAuthMode("register")}
            >
              Регистрация
            </button>
          </div>
          {authMode === "register" && (
            <input
              className="project-input"
              placeholder="Имя"
              value={authName}
              onChange={(event) => setAuthName(event.target.value)}
            />
          )}
          <input
            className="project-input"
            placeholder="Email"
            type="email"
            value={authEmail}
            onChange={(event) => setAuthEmail(event.target.value)}
          />
          <input
            className="project-input"
            placeholder="Пароль"
            type="password"
            value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
          />
          <button className="upload-button" onClick={submitAuth}>
            {authMode === "register" ? "Создать аккаунт" : "Войти"}
          </button>
          <p className="server-message">
            После входа можно оплатить тариф и видеть историю платежей.
          </p>
        </div>
      )}
    </section>
  );

  return (
    <main className="page-shell">
      <header className="site-header">
        <button className="brand-button" onClick={() => setPage("home")}>
          Стратег маркетплейсов
        </button>
        <nav className="site-nav" aria-label="Главная навигация">
          <button
            className={page === "home" ? "active" : ""}
            onClick={() => setPage("home")}
          >
            Главная / загрузка
          </button>
          <button
            className={page === "subscription" ? "active" : ""}
            onClick={() => setPage("subscription")}
          >
            Подписка
          </button>
          <button
            className={page === "account" ? "active" : ""}
            onClick={() => setPage("account")}
          >
            {user ? "Кабинет" : "Войти"}
          </button>
        </nav>
      </header>
      {page === "home"
        ? uploadPage
        : page === "subscription"
          ? subscriptionPage
          : accountPage}
    </main>
  );
}
