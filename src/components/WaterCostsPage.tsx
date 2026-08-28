import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Droplets,
  FileImage,
  FilePlus2,
  Gauge,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "../services/api";
import { clp, formatSiteDate, siteDayBoundsUtc } from "../utils/energy";
import EChart from "./EChart";

type WaterImage = {
  name: string;
  dataUrl: string;
  mimeType: string;
  bytes: number;
};
type WaterCharge = {
  label: string;
  cubicMeters: number | null;
  amountClp: number;
  category: string;
};
type WaterDocument = {
  id: number;
  pageNumber: number;
  originalName?: string | null;
  mimeType: string;
  bytes: number;
};
type WaterBill = {
  id: number;
  billingMonth: string;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  billingDays: number;
  readingSpanDays: number;
  issueDate?: string | null;
  dueDate?: string | null;
  nextReadingDate?: string | null;
  previousReadingM3: number | null;
  currentReadingM3: number | null;
  readingDifferenceM3: number | null;
  deductibleM3: number | null;
  billedM3: number;
  averageDailyM3: number | null;
  consumptionStatus: "actual" | "estimated" | "pending" | "unavailable";
  isEstimated: boolean;
  estimateMethod?: string | null;
  classificationReason?: string | null;
  amountClp: number;
  unitServiceRateClp: number | null;
  customerNumber?: string | null;
  meterNumber?: string | null;
  meterBrand?: string | null;
  meterModel?: string | null;
  invoiceNumber?: string | null;
  serviceAddress?: string | null;
  fixedChargeClp?: number | null;
  potableWaterChargeClp?: number | null;
  sewerCollectionChargeClp?: number | null;
  wastewaterTreatmentChargeClp?: number | null;
  subtotalServiceClp?: number | null;
  taxesClp?: number | null;
  otherChargesClp?: number | null;
  discountsClp?: number | null;
  chargeItems: WaterCharge[];
  source: string;
  aiConfidence?: number | null;
  documents: WaterDocument[];
};
type WaterPeriod = {
  id: number;
  periodStart: string;
  expectedCloseDate: string;
  actualCloseDate: string | null;
  openingReadingM3: number;
  closingReadingM3: number | null;
  status: "open" | "closed";
};
type WaterReading = {
  id: number;
  periodId: number | null;
  readingAt: string;
  readingM3: number;
  source: string;
  notes?: string | null;
  hasPhoto: boolean;
  originalName?: string | null;
  aiConfidence?: number | null;
  meterCycle: number;
  isMeterChange: boolean;
};
type WaterProjection = {
  consumedM3: number;
  averageDailyM3: number;
  projectedM3: number;
  projectedAmountClp: number;
  unitServiceRateClp: number;
  elapsedDays: number;
  remainingDays: number;
  lastReadingAt: string | null;
  calculatedAt: string;
  method: string;
};
type WaterSettings = {
  reminderEnabled: boolean;
  reminderDaysBefore: number;
  notifyDayBefore: boolean;
  notifySameDay: boolean;
  reminderTimeLocal: string;
  closingDayHint: number | null;
  updatedAt: string | null;
};
type WaterDashboard = {
  bills: WaterBill[];
  period: WaterPeriod | null;
  readings: WaterReading[];
  projection: WaterProjection | null;
  settings: WaterSettings;
  reminderSchedule: { nextReadingDate: string; daysRemaining: number; nextNotification: { date: string; timeLocal: string; label: string } | null } | null;
  today: string;
};
type WaterBillExtract = {
  provider: string | null;
  documentType: string | null;
  invoiceNumber: string | null;
  billingMonth: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  issueDate: string | null;
  dueDate: string | null;
  nextReadingDate: string | null;
  previousReadingM3: number | null;
  currentReadingM3: number | null;
  readingDifferenceM3: number | null;
  deductibleM3: number | null;
  billedM3: number | null;
  readingStatus: "actual" | "estimated" | "pending" | "unavailable";
  consumptionIsEstimated: boolean;
  previousReadingVisible: boolean;
  currentReadingVisible: boolean;
  previousReadingDateVisible: boolean;
  currentReadingDateVisible: boolean;
  amountClp: number | null;
  customerNumber: string | null;
  meterNumber: string | null;
  meterBrand: string | null;
  meterModel: string | null;
  serviceAddress: string | null;
  fixedChargeClp: number | null;
  potableWaterChargeClp: number | null;
  sewerCollectionChargeClp: number | null;
  wastewaterTreatmentChargeClp: number | null;
  subtotalServiceClp: number | null;
  taxesClp: number | null;
  otherChargesClp: number | null;
  discountsClp: number | null;
  chargeItems: WaterCharge[];
  confidence: number;
  warnings: string[];
};

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
function defaultBillDraft() {
  const periodEnd = formatSiteDate();
  return {
    billingMonth: periodEnd.slice(0, 7),
    periodStart: addDays(periodEnd, -30),
    periodEnd,
    issueDate: "",
    dueDate: "",
    nextReadingDate: "",
    previousReadingM3: "",
    currentReadingM3: "",
    readingDifferenceM3: "",
    deductibleM3: "",
    billedM3: "",
    readingStatus: "unavailable",
    amountClp: "",
    customerNumber: "",
    meterNumber: "",
    meterBrand: "SENSUS",
    meterModel: "",
    invoiceNumber: "",
    serviceAddress: "",
    fixedChargeClp: "",
    potableWaterChargeClp: "",
    sewerCollectionChargeClp: "",
    wastewaterTreatmentChargeClp: "",
    subtotalServiceClp: "",
    taxesClp: "",
    otherChargesClp: "",
    discountsClp: "",
  };
}
type BillDraft = ReturnType<typeof defaultBillDraft>;
function text(value: unknown) {
  return value == null ? "" : String(value);
}
function draftFromExtract(
  current: BillDraft,
  value: WaterBillExtract,
): BillDraft {
  return {
    ...current,
    billingMonth: text(value.billingMonth).slice(0, 7) || current.billingMonth,
    periodStart: value.periodStart || current.periodStart,
    periodEnd: value.periodEnd || current.periodEnd,
    issueDate: text(value.issueDate),
    dueDate: text(value.dueDate),
    nextReadingDate: text(value.nextReadingDate),
    previousReadingM3: text(value.previousReadingM3),
    currentReadingM3: text(value.currentReadingM3),
    readingDifferenceM3: text(value.readingDifferenceM3),
    deductibleM3: text(value.deductibleM3),
    billedM3: text(value.billedM3),
    readingStatus: value.readingStatus,
    amountClp: text(value.amountClp),
    customerNumber: text(value.customerNumber),
    meterNumber: text(value.meterNumber),
    meterBrand: text(value.meterBrand || current.meterBrand),
    meterModel: text(value.meterModel),
    invoiceNumber: text(value.invoiceNumber),
    serviceAddress: text(value.serviceAddress),
    fixedChargeClp: text(value.fixedChargeClp),
    potableWaterChargeClp: text(value.potableWaterChargeClp),
    sewerCollectionChargeClp: text(value.sewerCollectionChargeClp),
    wastewaterTreatmentChargeClp: text(value.wastewaterTreatmentChargeClp),
    subtotalServiceClp: text(value.subtotalServiceClp),
    taxesClp: text(value.taxesClp),
    otherChargesClp: text(value.otherChargesClp),
    discountsClp: text(value.discountsClp),
  };
}
function dateLabel(value?: string | null) {
  return value
    ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-CL", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}
function dateTimeLabel(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("es-CL", {
        timeZone: "America/Santiago",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Sin lecturas";
}
function monthLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });
}
function billMonth(bill: WaterBill) {
  return bill.billingMonth || bill.periodEnd;
}
function m3(value: number | null | undefined, digits = 0) {
  const displayDigits = digits === 3 ? 3 : digits === 2 ? 1 : digits;
  return `${Number(value || 0).toLocaleString("es-CL", { minimumFractionDigits: displayDigits, maximumFractionDigits: displayDigits })} m³`;
}
function litersFromM3(value: number) {
  return `${Math.round(value * 1000).toLocaleString("es-CL")} L`;
}
function waterRateLabel(value: number | null) {
  return value == null
    ? "Tasa no disponible"
    : `${value.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L/h`;
}
function elapsedTimeLabel(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainder = minutes % 60;
  return [days ? `${days} d` : "", hours ? `${hours} h` : "", `${remainder} min`]
    .filter(Boolean)
    .join(" ");
}
function parseReadingInput(value: string) {
  const compact = value.trim().replace(/\s/g, "");
  if (!/^\d+(?:[,.]\d{0,3})?$/.test(compact)) return null;
  const parsed = Number(compact.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0
    ? Number(parsed.toFixed(3))
    : null;
}
function formatReadingInput(value: number) {
  return Number(value).toFixed(3).replace(".", ",");
}
function localDateTimeInput() {
  return new Date()
    .toLocaleString("sv-SE", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
    .replace(" ", "T");
}
function toDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function optimizeImage(file: File): Promise<WaterImage> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error(`No fue posible abrir ${file.name}.`));
      element.src = url;
    });
    const scale = Math.min(
      1,
      1600 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas
      .getContext("2d")
      ?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("No fue posible optimizar la fotografía.")),
        "image/jpeg",
        0.82,
      ),
    );
    return {
      name: file.name,
      dataUrl: await toDataUrl(blob),
      mimeType: "image/jpeg",
      bytes: blob.size,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function WaterCostsPage({
  deviceSn,
  siteLabel,
}: {
  deviceSn: string;
  siteLabel: string;
}) {
  const [dashboard, setDashboard] = useState<WaterDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [billOpen, setBillOpen] = useState(false);
  const [billDraft, setBillDraft] = useState(defaultBillDraft);
  const [billImages, setBillImages] = useState<WaterImage[]>([]);
  const [billAi, setBillAi] = useState<WaterBillExtract | null>(null);
  const [billModel, setBillModel] = useState("");
  const [billBusy, setBillBusy] = useState(false);
  const [captureChooser, setCaptureChooser] = useState<
    "bill" | "reading" | null
  >(null);
  const [manualReadingOpen, setManualReadingOpen] = useState(false);
  const [chartFilter, setChartFilter] = useState("12m");
  const [viewDocument, setViewDocument] = useState<{
    kind: "bill" | "reading";
    id: number;
    title: string;
  } | null>(null);
  const [readingImage, setReadingImage] = useState<WaterImage | null>(null);
  const [readingValue, setReadingValue] = useState("");
  const [readingAt, setReadingAt] = useState(localDateTimeInput);
  const [readingNotes, setReadingNotes] = useState("");
  const [readingAi, setReadingAi] = useState<Record<string, unknown> | null>(
    null,
  );
  const [readingModel, setReadingModel] = useState("");
  const [readingBusy, setReadingBusy] = useState(false);
  const [deletingReadingId, setDeletingReadingId] = useState<number | null>(null);
  const [closeValue, setCloseValue] = useState("");
  const [openDraft, setOpenDraft] = useState({
    periodStart: formatSiteDate(),
    expectedCloseDate: addDays(formatSiteDate(), 30),
    openingReadingM3: "",
  });
  const [settingsDraft, setSettingsDraft] = useState<WaterSettings | null>(
    null,
  );
  const billCameraInput = useRef<HTMLInputElement>(null);
  const billLibraryInput = useRef<HTMLInputElement>(null);
  const readingCameraInput = useRef<HTMLInputElement>(null);
  const readingLibraryInput = useRef<HTMLInputElement>(null);

  async function reload(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const result = await api<WaterDashboard>(
        `devices/${deviceSn}/water-costs`,
      );
      setDashboard(result);
      setSettingsDraft(result.settings);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cargar los costos de agua.",
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<WaterDashboard>(`devices/${deviceSn}/water-costs`)
      .then((result) => {
        if (active) {
          setDashboard(result);
          setSettingsDraft(result.settings);
          setError("");
        }
      })
      .catch(
        (cause) =>
          active &&
          setError(
            cause instanceof Error
              ? cause.message
              : "No fue posible cargar los costos de agua.",
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [deviceSn]);
  useEffect(() => {
    if (!viewDocument) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setViewDocument(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [viewDocument]);

  const years = useMemo(
    () =>
      [
        ...new Set(
          (dashboard?.bills || []).map((bill) => billMonth(bill).slice(0, 4)),
        ),
      ].sort((a, b) => b.localeCompare(a)),
    [dashboard?.bills],
  );
  const chartBills = useMemo(() => {
    const ordered = [...(dashboard?.bills || [])].sort((a, b) =>
      billMonth(a).localeCompare(billMonth(b)),
    );
    if (/^\d{4}$/.test(chartFilter))
      return ordered.filter((bill) => billMonth(bill).startsWith(chartFilter));
    return ordered.slice(-(chartFilter === "6m" ? 6 : 12));
  }, [dashboard?.bills, chartFilter]);
  const chartSummary = useMemo(() => {
    const totalM3 = chartBills.reduce((sum, bill) => sum + bill.billedM3, 0);
    const totalDays = chartBills.reduce((sum, bill) => sum + Math.max(0, bill.periodDays || bill.billingDays || 0), 0);
    return {
      totalM3,
      averageMonthlyM3: chartBills.length ? totalM3 / chartBills.length : 0,
      averageDailyM3: totalDays ? totalM3 / totalDays : 0,
    };
  }, [chartBills]);
  const chartOption = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: "#071b23",
        borderColor: "#3c7182",
        textStyle: { color: "#edf9fb" },
        formatter: (params: unknown) => {
          const items = Array.isArray(params)
            ? (params as Array<{ dataIndex?: number }>)
            : [];
          const bill = chartBills[Number(items[0]?.dataIndex || 0)];
          return bill
            ? `<b>${monthLabel(billMonth(bill))}</b><br/><span style="color:${bill.isEstimated ? "#f3a847" : "#38bdf8"}">●</span> ${bill.isEstimated ? "Estimado · sin lectura completa" : "Real · con lecturas fechadas"}: <b>${m3(bill.billedM3)}</b><br/>Promedio diario: ${m3(bill.averageDailyM3, 2)}<br/>Cuenta: <b>${clp(bill.amountClp)}</b>`
            : "";
        },
      },
      legend: {
        top: 2,
        left: "center",
        right: 4,
        textStyle: { color: "#a9bdc3" },
        itemWidth: 15,
        itemHeight: 9,
        itemGap: 9,
      },
      toolbox: {
        show: true,
        top: 48,
        right: 4,
        iconStyle: { borderColor: "#8ea6ad" },
        emphasis: { iconStyle: { borderColor: "#ffffff" } },
        feature: {
          dataZoom: { title: { zoom: "Ampliar", back: "Deshacer ampliación" } },
          restore: { title: "Restablecer" },
          saveAsImage: { title: "Guardar imagen", pixelRatio: 2 },
        },
      },
      grid: { left: 34, right: 38, top: 96, bottom: 48, containLabel: true },
      xAxis: {
        type: "category",
        data: chartBills.map((bill) =>
          monthLabel(billMonth(bill)).replace(" de ", " "),
        ),
        axisLabel: {
          color: "#9db0b6",
          hideOverlap: true,
          rotate: chartBills.length > 8 ? 26 : 0,
        },
        axisLine: { lineStyle: { color: "#31525d" } },
      },
      yAxis: [
        {
          type: "value",
          name: "m³",
          axisLabel: { color: "#8ba0a8" },
          nameTextStyle: { color: "#8ba0a8" },
          splitLine: { lineStyle: { color: "rgba(110,150,160,.12)" } },
        },
        {
          type: "value",
          name: "CLP",
          axisLabel: {
            color: "#8ba0a8",
            formatter: (value: number) => `$${Math.round(value / 1000)}k`,
          },
          nameTextStyle: { color: "#8ba0a8" },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Lectura real",
          type: "bar",
          stack: "water",
          barMaxWidth: 44,
          data: chartBills.map((bill) =>
            bill.isEstimated ? null : bill.billedM3,
          ),
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#66dcff" },
                { offset: 1, color: "#1689c7" },
              ],
            },
            borderRadius: [8, 8, 2, 2],
          },
          label: {
            show: true,
            position: "top",
            color: "#c9f3ff",
            fontSize: 9,
            formatter: ({ value }: { value: number }) =>
              value == null
                ? ""
                : Number(value).toLocaleString("es-CL", {
                    maximumFractionDigits: 0,
                  }),
          },
        },
        {
          name: "Consumo estimado",
          type: "bar",
          stack: "water",
          barMaxWidth: 44,
          data: chartBills.map((bill) =>
            bill.isEstimated ? bill.billedM3 : null,
          ),
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#ffd27a" },
                { offset: 1, color: "#e38a20" },
              ],
            },
            borderRadius: [8, 8, 2, 2],
          },
          label: {
            show: true,
            position: "top",
            color: "#ffe3ad",
            fontSize: 9,
            formatter: ({ value }: { value: number }) =>
              value == null
                ? ""
                : Number(value).toLocaleString("es-CL", {
                    maximumFractionDigits: 0,
                  }),
          },
        },
        {
          name: "Monto de la cuenta",
          type: "line",
          yAxisIndex: 1,
          data: chartBills.map((bill) => bill.amountClp),
          symbolSize: 8,
          smooth: 0.25,
          lineStyle: { color: "#72e0a6", width: 2.5 },
          itemStyle: {
            color: "#72e0a6",
            borderColor: "#0a222b",
            borderWidth: 2,
          },
          areaStyle: { color: "rgba(75,210,139,.07)" },
        },
      ],
    }),
    [chartBills],
  );
  const dailyReadingChart = useMemo(() => {
    const period = dashboard?.period;
    if (!period) return null;
    const dayKeys: string[] = [];
    for (let day = period.periodStart; day <= period.expectedCloseDate; day = addDays(day, 1)) {
      dayKeys.push(day);
      if (dayKeys.length >= 40) break;
    }
    const calculated = new Map<string, number>();
    const ordered = [...(dashboard?.readings || [])].sort((a, b) => a.readingAt.localeCompare(b.readingAt));
    let previousValue = period.openingReadingM3;
    let previousDate = period.periodStart;
    let previousCycle = ordered[0]?.meterCycle ?? 1;
    for (const reading of ordered) {
      const readingDate = new Date(reading.readingAt).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      const changed = reading.isMeterChange || reading.meterCycle !== previousCycle || reading.readingM3 < previousValue;
      if (!changed) {
        const segmentDays = dayKeys.filter((day) => day > previousDate && day <= readingDate);
        const daily = segmentDays.length ? Math.max(0, reading.readingM3 - previousValue) / segmentDays.length : 0;
        for (const day of segmentDays) calculated.set(day, daily);
      }
      previousValue = reading.readingM3;
      previousDate = readingDate;
      previousCycle = reading.meterCycle;
    }
    const latestDate = ordered.at(-1) ? new Date(ordered.at(-1)!.readingAt).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) : period.periodStart;
    const projectedDaily = Math.max(0, Number(dashboard?.projection?.averageDailyM3 || 0));
    const calculatedValues = dayKeys.map((day) => calculated.has(day) ? Number(calculated.get(day)!.toFixed(3)) : null);
    const projectedValues = dayKeys.map((day) => day > latestDate && projectedDaily > 0 ? Number(projectedDaily.toFixed(3)) : null);
    return {
      option: {
        tooltip: { trigger: 'axis', confine: true, formatter: (params: unknown) => { const items = Array.isArray(params) ? params as Array<{dataIndex?:number;seriesName?:string;value?:number}> : []; const index = Number(items[0]?.dataIndex || 0); const value = items.find((item) => item.value != null); return `<b>${dateLabel(dayKeys[index])}</b><br/>${value?.seriesName || 'Consumo'}: <b>${m3(Number(value?.value || 0), 3)}</b>`; } },
        legend: { top: 2, textStyle: { color: '#a9bdc3' } },
        grid: { left: 34, right: 12, top: 52, bottom: 54, containLabel: true },
        xAxis: { type: 'category', data: dayKeys.map((day) => dateLabel(day).replace(/ de /g, ' ')), axisLabel: { color: '#8fa6ad', rotate: dayKeys.length > 18 ? 42 : 0, interval: dayKeys.length > 20 ? 2 : 0 }, axisLine: { lineStyle: { color: '#31525d' } } },
        yAxis: { type: 'value', name: 'm³/día', axisLabel: { color: '#8ba0a8' }, nameTextStyle: { color: '#8ba0a8' }, splitLine: { lineStyle: { color: 'rgba(110,150,160,.12)' } } },
        series: [
          { name: 'Calculado entre lecturas', type: 'bar', stack: 'daily', data: calculatedValues, itemStyle: { color: '#38bdf8', borderRadius: [4,4,0,0] } },
          { name: 'Estimado hasta el cierre', type: 'bar', stack: 'daily', data: projectedValues, itemStyle: { color: '#f3a847', borderRadius: [4,4,0,0] } }
        ]
      },
      totalCalculated: calculatedValues.reduce<number>((sum, value) => sum + Number(value || 0), 0),
      projectedDaily
    };
  }, [dashboard?.period, dashboard?.projection, dashboard?.readings]);

  async function chooseBillFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setMessage("Optimizando páginas…");
    try {
      const selected = Array.from(files).slice(
        0,
        Math.max(0, 4 - billImages.length),
      );
      const next = [
        ...billImages,
        ...(await Promise.all(selected.map(optimizeImage))),
      ];
      if (next.reduce((sum, item) => sum + item.bytes, 0) > 2_800_000)
        throw new Error(
          "Las imágenes pesan demasiado en conjunto. Elimina una página o toma fotos más cercanas.",
        );
      setBillImages(next);
      setBillAi(null);
      await importBillAutomatically(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible preparar las imágenes.",
      );
    }
    if (billCameraInput.current) billCameraInput.current.value = "";
    if (billLibraryInput.current) billLibraryInput.current.value = "";
  }

  async function importBillAutomatically(images: WaterImage[]) {
    setBillBusy(true);
    setError("");
    setMessage("La IA está leyendo y guardando la boleta automáticamente…");
    try {
      const result = await api<{ extracted: WaterBillExtract; model: string }>(
        `devices/${deviceSn}/water-bills/extract`,
        { method: "POST", body: JSON.stringify({ images }) },
      );
      const value = result.extracted;
      const draft = draftFromExtract(defaultBillDraft(), value);
      setBillAi(value);
      setBillModel(result.model);
      setBillDraft(draft);
      const saved = await api<{
        bill: WaterBill & { documentWarnings?: string[] };
      }>(`devices/${deviceSn}/water-bills`, {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          chargeItems: value.chargeItems || [],
          images,
          aiExtraction: value,
          aiConfidence: value.confidence,
          aiModel: result.model,
        }),
      });
      setBillDraft(defaultBillDraft());
      setBillImages([]);
      setBillAi(null);
      setBillModel("");
      setBillOpen(false);
      const warning = saved.bill?.documentWarnings?.join(" ");
      setMessage(
        `Cuenta de ${monthLabel(billMonth(saved.bill))} guardada automáticamente como ${saved.bill.isEstimated ? "consumo estimado" : "lectura real"}.${warning ? ` ${warning}` : ""}`,
      );
      await reload();
    } catch (cause) {
      setBillOpen(true);
      setError(
        cause instanceof Error
          ? `${cause.message} Puedes abrir “Revisión manual” y guardarla igualmente.`
          : "No fue posible procesar la boleta.",
      );
    } finally {
      setBillBusy(false);
    }
  }

  async function saveBill() {
    setBillBusy(true);
    setError("");
    setMessage("Guardando la boleta y sus fotografías en Mi Solar…");
    try {
      const saved = await api<{
        bill?: { documentWarnings?: string[] };
        documentWarnings?: string[];
      }>(`devices/${deviceSn}/water-bills`, {
        method: "POST",
        body: JSON.stringify({
          ...billDraft,
          consumptionIsEstimated:
            billAi?.consumptionIsEstimated ??
            billDraft.readingStatus !== "actual",
          chargeItems: billAi?.chargeItems || [],
          images: billImages,
          aiExtraction: billAi,
          aiConfidence: billAi?.confidence ?? null,
          aiModel: billModel,
        }),
      });
      setBillDraft(defaultBillDraft());
      setBillImages([]);
      setBillAi(null);
      setBillModel("");
      setBillOpen(false);
      const documentWarnings =
        saved.bill?.documentWarnings || saved.documentWarnings || [];
      setMessage(
        documentWarnings.length
          ? `Cuenta guardada. ${documentWarnings.join(" ")}`
          : "Cuenta de agua, cargos y documentos guardados permanentemente.",
      );
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible guardar la boleta.",
      );
    } finally {
      setBillBusy(false);
    }
  }

  async function chooseReadingPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setReadingBusy(true);
    setError("");
    setMessage("Preparando y leyendo el visor del medidor…");
    try {
      const image = await optimizeImage(file);
      setReadingImage(image);
      const result = await api<{
        extracted: Record<string, unknown> & {
          readingM3: number | null;
          confidence: number;
          warnings: string[];
        };
        model: string;
      }>(`devices/${deviceSn}/water-meter/extract`, {
        method: "POST",
        body: JSON.stringify({ images: [image] }),
      });
      setReadingAi(result.extracted);
      setReadingModel(result.model);
      setReadingValue(
        result.extracted.readingM3 == null
          ? ""
          : formatReadingInput(result.extracted.readingM3),
      );
      if (result.extracted.readingM3 == null || !dashboard?.period) {
        setManualReadingOpen(true);
        setMessage(
          "No fue posible leer el visor con seguridad. Ingresa solamente el número y pulsa guardar.",
        );
      } else {
        await api(`devices/${deviceSn}/water-meter/readings`, {
          method: "POST",
          body: JSON.stringify({
            periodId: dashboard.period.id,
            readingAt: new Date().toISOString(),
            readingM3: result.extracted.readingM3,
            notes: readingNotes || null,
            image,
            aiExtraction: result.extracted,
            aiConfidence: result.extracted.confidence,
            aiModel: result.model,
          }),
        });
        setReadingImage(null);
        setReadingValue("");
        setReadingNotes("");
        setReadingAi(null);
        setReadingModel("");
        setReadingAt(localDateTimeInput());
        setMessage(
          `Lectura de ${m3(result.extracted.readingM3, 3)} guardada con fecha, hora y fotografía.`,
        );
        await reload();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible leer el medidor.",
      );
    } finally {
      setReadingBusy(false);
      if (readingCameraInput.current) readingCameraInput.current.value = "";
      if (readingLibraryInput.current) readingLibraryInput.current.value = "";
    }
  }

  async function saveReading(useCurrentTime = false) {
    if (!dashboard?.period) return;
    const parsedReading = parseReadingInput(readingValue);
    if (parsedReading == null) {
      setError("Ingresa la lectura con tres decimales, por ejemplo 7893,125.");
      return;
    }
    setReadingBusy(true);
    setError("");
    try {
      await api(`devices/${deviceSn}/water-meter/readings`, {
        method: "POST",
        body: JSON.stringify({
          periodId: dashboard.period.id,
          readingAt: useCurrentTime
            ? new Date().toISOString()
            : new Date(readingAt).toISOString(),
          readingM3: parsedReading,
          notes: readingNotes,
          image: readingImage,
          aiExtraction: readingAi,
          aiConfidence: Number(readingAi?.confidence || 0),
          aiModel: readingModel,
        }),
      });
      setReadingImage(null);
      setReadingValue("");
      setReadingNotes("");
      setReadingAi(null);
      setReadingModel("");
      setReadingAt(localDateTimeInput());
      setManualReadingOpen(false);
      setMessage("Lectura guardada. La proyección del mes fue actualizada.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible guardar la lectura.",
      );
    } finally {
      setReadingBusy(false);
    }
  }

  async function openPeriod() {
    setReadingBusy(true);
    setError("");
    try {
      await api(`devices/${deviceSn}/water-periods/open`, {
        method: "POST",
        body: JSON.stringify(openDraft),
      });
      setMessage("Mes de agua abierto correctamente.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible abrir el período.",
      );
    } finally {
      setReadingBusy(false);
    }
  }

  async function closePeriod() {
    if (!dashboard?.period) return;
    setReadingBusy(true);
    setError("");
    try {
      await api(`devices/${deviceSn}/water-periods/close`, {
        method: "POST",
        body: JSON.stringify({
          periodId: dashboard.period.id,
          closingReadingM3: Number(closeValue),
          readingAt: new Date().toISOString(),
        }),
      });
      setCloseValue("");
      setMessage(
        "Mes cerrado: consumo consolidado en el historial y nuevo período abierto automáticamente.",
      );
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cerrar el período.",
      );
    } finally {
      setReadingBusy(false);
    }
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    setError("");
    try {
      const result = await api<{ settings: WaterSettings }>(
        `devices/${deviceSn}/water-settings`,
        { method: "PATCH", body: JSON.stringify(settingsDraft) },
      );
      setSettingsDraft(result.settings);
      setDashboard((current) =>
        current ? { ...current, settings: result.settings } : current,
      );
      setMessage("Recordatorio de lectura guardado.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible guardar el recordatorio.",
      );
    }
  }

  async function removeBill(bill: WaterBill) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente la cuenta de ${monthLabel(billMonth(bill))} y sus fotografías?`,
      )
    )
      return;
    setError("");
    try {
      await api(`devices/${deviceSn}/water-bills/${bill.id}`, {
        method: "DELETE",
      });
      setMessage("Cuenta de agua eliminada de la base de datos.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible eliminar la cuenta.",
      );
    }
  }

  async function removeReading(reading: WaterReading) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente la lectura de ${m3(reading.readingM3, 3)} del ${dateTimeLabel(reading.readingAt)}${reading.hasPhoto ? " y su fotografía" : ""}?`,
      )
    )
      return;
    setDeletingReadingId(reading.id);
    setError("");
    try {
      await api(`devices/${deviceSn}/water-meter/readings/${reading.id}`, {
        method: "DELETE",
      });
      setMessage("Lectura eliminada. Los diferenciales y la proyección fueron recalculados.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible eliminar la lectura.",
      );
    } finally {
      setDeletingReadingId(null);
    }
  }

  if (loading)
    return (
      <section className="water-costs-page">
        <section className="panel water-loading">
          Cargando costos de agua…
        </section>
      </section>
    );
  const bills = dashboard?.bills || [];
  const projection = dashboard?.projection;
  const period = dashboard?.period;
  const readings = dashboard?.readings || [];

  return (
    <section className="water-costs-page">
      <header className="water-hero">
        <div className="water-hero-icon">
          <Droplets />
        </div>
        <div>
          <small>Control de Aguas Cordillera · {siteLabel}</small>
          <h1>Cuenta Aguas Cordillera</h1>
        </div>
      </header>
      {dashboard?.reminderSchedule ? (
        <section className="water-next-reading-line" aria-label="Próxima lectura Aguas Cordillera">
          <CalendarClock />
          <strong>Próxima lectura Aguas Cordillera</strong>
          <span>{dateLabel(dashboard.reminderSchedule.nextReadingDate)}</span>
          <b>{dashboard.reminderSchedule.daysRemaining === 0 ? "Hoy" : dashboard.reminderSchedule.daysRemaining === 1 ? "Falta 1 día" : `Faltan ${dashboard.reminderSchedule.daysRemaining} días`}</b>
        </section>
      ) : null}
      <input
        className="water-hidden-input"
        ref={billCameraInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(event) => void chooseBillFiles(event.target.files)}
      />
      <input
        className="water-hidden-input"
        ref={billLibraryInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => void chooseBillFiles(event.target.files)}
      />
      <input
        className="water-hidden-input"
        ref={readingCameraInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(event) => void chooseReadingPhoto(event.target.files)}
      />
      <input
        className="water-hidden-input"
        ref={readingLibraryInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => void chooseReadingPhoto(event.target.files)}
      />
      <section
        className="water-quick-actions"
        aria-label="Accesos rápidos de agua"
      >
        <button
          className="bill"
          type="button"
          onClick={() => setCaptureChooser("bill")}
          disabled={billBusy}
        >
          <FilePlus2 />
          <span>
            <b>{billBusy ? "Analizando boleta…" : "Subir boleta"}</b>
            <small>Elegir foto o abrir cámara</small>
          </span>
        </button>
        <button
          className="reading"
          type="button"
          onClick={() => {
            setReadingAt(localDateTimeInput());
            setManualReadingOpen(true);
          }}
          disabled={readingBusy}
        >
          <Gauge />
          <span>
            <b>{readingBusy ? "Leyendo medidor…" : "Subir lectura de hoy"}</b>
            <small>Ingresa el número · foto opcional</small>
          </span>
        </button>
      </section>
      {manualReadingOpen ? (
        <section className="panel water-quick-reading" aria-live="polite">
          <header>
            <div>
              <small>Ingreso manual rápido</small>
              <h2>Lectura de hoy</h2>
              <p>Escribe el número del visor. La fecha y hora son automáticas.</p>
            </div>
            <button
              type="button"
              onClick={() => setManualReadingOpen(false)}
              aria-label="Cerrar ingreso manual"
            >
              <X />
            </button>
          </header>
          <div className="water-quick-reading-form">
            <label>
              <span>Lectura exacta de hoy (m³)</span>
              <input
                type="text"
                inputMode="decimal"
                value={readingValue}
                onChange={(event) => setReadingValue(event.target.value)}
                onBlur={() => {
                  const value = parseReadingInput(readingValue);
                  if (value != null) setReadingValue(formatReadingInput(value));
                }}
                placeholder="Ej. 7893,125"
              />
              <small>Siempre 3 decimales: 0,125 m³ = 125 litros.</small>
            </label>
            <label>
              <span>Nota opcional</span>
              <input
                value={readingNotes}
                onChange={(event) => setReadingNotes(event.target.value)}
                placeholder="Ej. lectura ingresada por Carola"
              />
            </label>
            <div className="water-optional-photo">
              <span><Camera/><span><b>Foto opcional</b><small>También puedes dejar que la IA lea el visor.</small></span></span>
              <div>
                <button type="button" onClick={() => readingCameraInput.current?.click()}><Camera/> Sacar foto</button>
                <button type="button" onClick={() => readingLibraryInput.current?.click()}><FileImage/> Elegir del rollo</button>
              </div>
            </div>
            <div className="water-quick-reading-time">
              <CalendarClock />
              <span>
                <small>Se guardará con</small>
                <b>{dateTimeLabel(new Date().toISOString())}</b>
              </span>
            </div>
            <button
              className="primary"
              type="button"
              onClick={() => void saveReading(true)}
              disabled={
                readingBusy || parseReadingInput(readingValue) == null || !period
              }
            >
              <Save /> {readingBusy ? "Guardando…" : "Ingresar lectura"}
            </button>
          </div>
        </section>
      ) : null}
      {captureChooser ? (
        <div
          className="water-source-backdrop"
          role="presentation"
          onClick={() => setCaptureChooser(null)}
        >
          <section
            className="water-source-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="water-source-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>
                  {captureChooser === "bill" ? "Nueva boleta" : "Lectura de hoy"}
                </small>
                <h2 id="water-source-title">¿Cómo quieres subir la imagen?</h2>
              </div>
              <button
                type="button"
                onClick={() => setCaptureChooser(null)}
                aria-label="Cancelar"
              >
                <X />
              </button>
            </header>
            {captureChooser === "reading" ? (
              <label className="water-source-note">
                <span>Nota opcional</span>
                <input
                  value={readingNotes}
                  onChange={(event) => setReadingNotes(event.target.value)}
                  placeholder="Ej. lectura tomada por Carola"
                />
              </label>
            ) : null}
            <div>
              <button
                type="button"
                onClick={() => {
                  const input =
                    captureChooser === "bill"
                      ? billCameraInput.current
                      : readingCameraInput.current;
                  setCaptureChooser(null);
                  input?.click();
                }}
              >
                <Camera />
                <span>
                  <b>Sacar foto</b>
                  <small>Abrir la cámara ahora</small>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const input =
                    captureChooser === "bill"
                      ? billLibraryInput.current
                      : readingLibraryInput.current;
                  setCaptureChooser(null);
                  input?.click();
                }}
              >
                <FileImage />
                <span>
                  <b>Elegir del rollo</b>
                  <small>Buscar una foto guardada</small>
                </span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {message ? (
        <p className="water-message">
          <CheckCircle2 /> {message}
        </p>
      ) : null}
      {error ? <p className="water-error">{error}</p> : null}

      <section className="panel water-chart-card">
        <header>
          <div>
            <small>Lo primero: historial respaldado</small>
            <h2>Agua consumida y total pagado</h2>
            <p>
              Azul: lectura real verificada · naranja: estimación sin lectura
              completa.
            </p>
          </div>
          <nav aria-label="Período visible">
            <button
              className={chartFilter === "6m" ? "active" : ""}
              onClick={() => setChartFilter("6m")}
            >
              6 meses
            </button>
            <button
              className={chartFilter === "12m" ? "active" : ""}
              onClick={() => setChartFilter("12m")}
            >
              12 meses
            </button>
            {years.map((year) => (
              <button
                className={chartFilter === year ? "active" : ""}
                onClick={() => setChartFilter(year)}
                key={year}
              >
                {year}
              </button>
            ))}
          </nav>
        </header>
        {chartBills.length ? (
          <EChart option={chartOption} className="water-chart" />
        ) : (
          <div className="water-empty-chart">
            <Droplets />
            <b>Aún no hay cuentas guardadas</b>
            <span>Sube la primera boleta para iniciar el historial.</span>
          </div>
        )}
        <footer>
          <span>
            <b>
              {m3(chartSummary.totalM3)}
            </b>{" "}
            consumo visible
            <small>Promedio mensual: {m3(chartSummary.averageMonthlyM3, 2)}</small>
            <small>Promedio diario: {m3(chartSummary.averageDailyM3, 2)}</small>
          </span>
          <span>
            <b>
              {clp(chartBills.reduce((sum, bill) => sum + bill.amountClp, 0))}
            </b>{" "}
            total pagado
          </span>
          <span>
            <b>
              {chartBills.filter((bill) => !bill.isEstimated).length} reales ·{" "}
              {chartBills.filter((bill) => bill.isEstimated).length} estimadas
            </b>{" "}
            clasificación automática
          </span>
        </footer>
      </section>

      <section className="panel water-current">
        <header>
          <div>
            <small>Seguimiento entre lecturas</small>
            <h2>
              {period ? monthLabel(period.expectedCloseDate) : "Mes en curso"}
            </h2>
            <p>
              {period
                ? `${dateLabel(period.periodStart)} → ${dateLabel(period.expectedCloseDate)}`
                : "Abre el período para comenzar"}
            </p>
          </div>
          {period ? (
            <span className="water-status-open">● Mes en curso</span>
          ) : (
            <span className="water-status-pending">Sin período</span>
          )}
        </header>
        {period && projection ? (
          <div className="water-current-glance">
            <span>
              <small>Consumido a la fecha</small>
              <b>{m3(projection.consumedM3)}</b>
            </span>
            <span>
              <small>Promedio diario</small>
              <b>{m3(projection.averageDailyM3, 1)}/día</b>
            </span>
            <span>
              <small>Proyección del período</small>
              <b>{m3(projection.projectedM3)}</b>
            </span>
            <span className="featured">
              <small>Total proyectado</small>
              <b>{clp(projection.projectedAmountClp)}</b>
              <em>$1.500 por m³</em>
            </span>
          </div>
        ) : null}
        <div className="water-current-details is-always-open">
          <h3 className="water-current-details-title">Detalles, fotos y cierre del mes</h3>
          {period ? (
            <>
              <div className="water-period-meta">
                <span>
                  <small>Inicio</small>
                  <b>{dateLabel(period.periodStart)}</b>
                </span>
                <span>
                  <small>Cierre estimado</small>
                  <b>{dateLabel(period.expectedCloseDate)}</b>
                </span>
                <span>
                  <small>Lectura inicial</small>
                  <b>{m3(period.openingReadingM3, 3)}</b>
                </span>
                <span>
                  <small>Última lectura</small>
                  <b>
                    {readings[0]
                      ? m3(readings[0].readingM3, 3)
                      : "Pendiente"}
                  </b>
                </span>
              </div>
              {projection ? (
                <div className="water-projection">
                  <article>
                    <small>Consumido hasta ahora</small>
                    <strong>{m3(projection.consumedM3)}</strong>
                    <span>Según lecturas guardadas</span>
                  </article>
                  <article>
                    <small>Promedio diario</small>
                    <strong>{m3(projection.averageDailyM3, 1)}</strong>
                    <span>por día</span>
                  </article>
                  <article className="featured">
                    <small>Proyección al cierre</small>
                    <strong>{m3(projection.projectedM3)}</strong>
                    <span>
                      {clp(projection.projectedAmountClp)} · $1.500/m³
                    </span>
                  </article>
                  <article>
                    <small>Última actualización</small>
                    <strong>{dateTimeLabel(projection.lastReadingAt)}</strong>
                    <span>
                      {projection.method === "current-readings"
                        ? "Medición del mes actual"
                        : "Promedio histórico"}
                    </span>
                  </article>
                </div>
              ) : null}
              {readings.length ? (
                <div className="water-reading-history">
                  <h3>Lecturas del período</h3>
                  {readings.map((reading, index) => {
                    const previousReading = readings[index + 1];
                    const meterChanged = reading.isMeterChange || (previousReading != null && reading.meterCycle !== previousReading.meterCycle);
                    const previousReadingM3 = previousReading?.readingM3 ?? period.openingReadingM3;
                    const previousReadingAt = previousReading?.readingAt;
                    const differenceM3 = meterChanged ? null : Number((reading.readingM3 - previousReadingM3).toFixed(3));
                    const previousTime = previousReadingAt
                      ? Date.parse(previousReadingAt)
                      : siteDayBoundsUtc(period.periodStart).start.getTime();
                    const elapsedMinutes = Math.max(
                      0,
                      (Date.parse(reading.readingAt) - previousTime) / 60_000,
                    );
                    const litersPerHour =
                      differenceM3 != null && differenceM3 >= 0 && elapsedMinutes > 0
                        ? (differenceM3 * 1000 * 60) / elapsedMinutes
                        : null;
                    return (
                      <article key={reading.id}>
                      {reading.hasPhoto ? (
                        <button
                          className="water-reading-photo-icon"
                          type="button"
                          onClick={() =>
                            setViewDocument({
                              kind: "reading",
                              id: reading.id,
                              title: `Lectura ${m3(reading.readingM3, 3)}`,
                            })
                          }
                          aria-label={`Abrir foto de la lectura ${m3(reading.readingM3, 3)}`}
                          title="Abrir foto"
                        >
                          <Camera />
                          <i aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="manual">
                          <Gauge />
                        </span>
                      )}
                      <div>
                        <b>{m3(reading.readingM3, 3)}</b>
                        <small>
                          {dateTimeLabel(reading.readingAt)} ·{" "}
                          {reading.source === "photo-ai"
                            ? "foto IA"
                            : reading.source === "closing"
                              ? "cierre"
                              : "manual"}
                        </small>
                        {meterChanged ? (
                          <span className="water-reading-difference meter-change">
                            <span>Cambio de medidor</span>
                            <strong>Nuevo contador · ciclo {reading.meterCycle}</strong>
                            <small>Base {m3(reading.readingM3, 3)} · sin restar el medidor anterior</small>
                          </span>
                        ) : (
                          <span
                            className={`water-reading-difference ${differenceM3 != null && differenceM3 < 0 ? "negative" : ""}`}
                            title={`Diferencia respecto de ${m3(previousReadingM3, 3)}`}
                          >
                            <span>Diferencia con lectura anterior</span>
                            <strong>
                              {differenceM3 != null && differenceM3 > 0 ? "+" : ""}
                              {m3(differenceM3, 3)}
                            </strong>
                            <small>
                              {differenceM3 != null && differenceM3 > 0 ? "+" : ""}
                              {litersFromM3(differenceM3 || 0)}
                            </small>
                            <small>{waterRateLabel(litersPerHour)}</small>
                            <em>
                              en {elapsedTimeLabel(elapsedMinutes)}
                              {!previousReadingAt ? " · desde el inicio del período" : ""}
                            </em>
                          </span>
                        )}
                        {reading.notes &&
                        reading.notes !== "Lectura rápida desde fotografía" ? (
                          <em className="water-reading-note">
                            Nota: {reading.notes}
                          </em>
                        ) : null}
                      </div>
                      <button
                        className="water-reading-delete"
                        type="button"
                        disabled={deletingReadingId === reading.id}
                        onClick={() => void removeReading(reading)}
                        aria-label={`Eliminar lectura ${m3(reading.readingM3, 3)}`}
                        title="Eliminar lectura"
                      >
                        <Trash2 />
                      </button>
                      </article>
                    );
                  })}
                </div>
              ) : null}
              {dailyReadingChart ? (
                <section className="water-daily-reading-chart">
                  <header>
                    <div><small>Estimación distribuida entre lecturas</small><h3>Consumo diario del período</h3></div>
                    <span>Azul: calculado · naranja: proyectado</span>
                  </header>
                  <EChart option={dailyReadingChart.option} className="water-daily-chart" />
                  <footer>
                    <span><small>Consumo distribuido hasta la última lectura</small><b>{m3(dailyReadingChart.totalCalculated, 3)}</b></span>
                    <span><small>Promedio usado para días restantes</small><b>{m3(dailyReadingChart.projectedDaily, 3)}/día</b></span>
                  </footer>
                </section>
              ) : null}
              <section className="water-close-period is-always-open">
                <h3>Cerrar este período</h3>
                <p>
                  El cierre deja registrada la última lectura. La boleta oficial
                  se podrá subir después.
                </p>
                <div>
                  <input
                    type="number"
                    min={period.openingReadingM3}
                    step="0.001"
                    value={closeValue}
                    onChange={(event) => setCloseValue(event.target.value)}
                    placeholder="Lectura final en m³"
                  />
                  <button
                    type="button"
                    onClick={() => void closePeriod()}
                    disabled={!closeValue || readingBusy}
                  >
                    Confirmar cierre
                  </button>
                </div>
              </section>
            </>
          ) : (
            <div className="water-open-period">
              <Droplets />
              <div>
                <h3>Abrir el mes en curso</h3>
                <p>
                  Indica la lectura inicial y la fecha probable de la próxima
                  lectura.
                </p>
              </div>
              <label>
                Fecha inicial
                <input
                  type="date"
                  value={openDraft.periodStart}
                  onChange={(event) =>
                    setOpenDraft((current) => ({
                      ...current,
                      periodStart: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Cierre estimado
                <input
                  type="date"
                  value={openDraft.expectedCloseDate}
                  onChange={(event) =>
                    setOpenDraft((current) => ({
                      ...current,
                      expectedCloseDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Lectura inicial (m³)
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={openDraft.openingReadingM3}
                  onChange={(event) =>
                    setOpenDraft((current) => ({
                      ...current,
                      openingReadingM3: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                type="button"
                onClick={() => void openPeriod()}
                disabled={!openDraft.openingReadingM3 || readingBusy}
              >
                Abrir seguimiento
              </button>
            </div>
          )}
        </div>
      </section>

      {settingsDraft ? (
        <details className="panel water-notifications">
          <summary>
            <Bell />
            <span>
              <b>Notificaciones</b>
              <small>Recordatorio para subir la lectura</small>
            </span>
            <ChevronDown />
          </summary>
          <section className="water-reminder">
          <header>
            <Bell />
            <div>
              <small>Notificación automática</small>
              <h2>Recordatorio para subir la lectura</h2>
              <p>Mi Solar puede avisarte el día anterior y el mismo día del cierre de este período.</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settingsDraft.reminderEnabled}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current
                      ? { ...current, reminderEnabled: event.target.checked }
                      : current,
                  )
                }
              />
              <i />
            </label>
          </header>
          <div>
            <label><input type="checkbox" checked={settingsDraft.notifyDayBefore} onChange={(event)=>setSettingsDraft((current)=>current?{...current,notifyDayBefore:event.target.checked}:current)}/> Avisar el día anterior</label>
            <label><input type="checkbox" checked={settingsDraft.notifySameDay} onChange={(event)=>setSettingsDraft((current)=>current?{...current,notifySameDay:event.target.checked}:current)}/> Avisar el mismo día</label>
            <label>
              Hora local de Chile
              <input
                type="time"
                value={settingsDraft.reminderTimeLocal}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current
                      ? { ...current, reminderTimeLocal: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label>
              Día habitual de cierre
              <input
                type="number"
                min="1"
                max="31"
                value={settingsDraft.closingDayHint ?? ""}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current
                      ? {
                          ...current,
                          closingDayHint:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        }
                      : current,
                  )
                }
                placeholder="Automático"
              />
            </label>
            <button type="button" onClick={() => void saveSettings()}>
              <Save /> Guardar aviso
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void api(`devices/${deviceSn}/water-reminder-test`, {
                  method: "POST",
                })
                  .then(() => setMessage("Notificación de prueba enviada."))
                  .catch((cause) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "No fue posible enviar la prueba.",
                    ),
                  )
              }
            >
              <Bell /> Probar
            </button>
          </div>
          <div className="water-next-reminder"><CalendarClock/><span><small>Fecha de lectura y cierre: {dashboard?.period ? dateLabel(dashboard.period.expectedCloseDate) : 'por calcular'}</small><b>{!settingsDraft.reminderEnabled ? 'Activa los avisos para programar la próxima notificación' : dashboard?.reminderSchedule?.nextNotification ? `Próxima notificación: ${dateLabel(dashboard.reminderSchedule.nextNotification.date)} · ${dashboard.reminderSchedule.nextNotification.timeLocal} h · ${dashboard.reminderSchedule.nextNotification.label}` : 'No quedan avisos pendientes para este período'}</b></span></div>
          </section>
        </details>
      ) : null}

      {billOpen ? (
        <section className="panel water-bill-entry">
          <header>
            <div>
              <small>Carga automática</small>
              <h2>Subir cuenta de Aguas Cordillera</h2>
              <p>
                Elige una o varias fotos. La IA extrae, clasifica y guarda todo
                sin preguntarte datos.
              </p>
            </div>
            <button onClick={() => setBillOpen(false)} aria-label="Cerrar">
              <X />
            </button>
          </header>
          <div className="water-upload-zone">
            <button
              type="button"
              onClick={() => setCaptureChooser("bill")}
              disabled={billBusy}
            >
              <Upload />{" "}
              {billBusy
                ? "Analizando y guardando…"
                : "Elegir o fotografiar boleta"}
            </button>
            <span>
              {billImages.length
                ? `${billImages.length} página(s) en proceso`
                : "Selecciona y listo · hasta 4 páginas"}
            </span>
            {billImages.length && !billBusy ? (
              <button
                className="analyze"
                type="button"
                onClick={() => void importBillAutomatically(billImages)}
              >
                <Sparkles /> Reintentar guardado automático
              </button>
            ) : null}
          </div>
          {billImages.length ? (
            <div className="water-upload-list">
              {billImages.map((image, index) => (
                <span key={`${image.name}-${index}`}>
                  <FileImage />
                  <b>Página {index + 1}</b>
                  <small>{image.name}</small>
                  <button
                    onClick={() =>
                      setBillImages((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <X />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {billAi?.warnings?.length ? (
            <aside className="water-ai-warnings">
              <b>Revisión recomendada</b>
              {billAi.warnings.map((warning) => (
                <span key={warning}>• {warning}</span>
              ))}
            </aside>
          ) : null}
          <details className="water-manual-fallback">
            <summary>
              Revisión manual — solo si la IA no pudo leer la boleta
            </summary>
            <div className="water-bill-form">
              <label>
                Desde
                <input
                  type="date"
                  value={billDraft.periodStart}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      periodStart: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  value={billDraft.periodEnd}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      periodEnd: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Emisión
                <input
                  type="date"
                  value={billDraft.issueDate}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      issueDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Vencimiento
                <input
                  type="date"
                  value={billDraft.dueDate}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Próxima lectura
                <input
                  type="date"
                  value={billDraft.nextReadingDate}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      nextReadingDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Clasificación automática
                <input value="Mi Solar decide con fechas y lecturas" readOnly />
              </label>
              <label>
                Lectura anterior (m³)
                <input
                  type="number"
                  step="0.001"
                  value={billDraft.previousReadingM3}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      previousReadingM3: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Lectura actual (m³)
                <input
                  type="number"
                  step="0.001"
                  value={billDraft.currentReadingM3}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      currentReadingM3: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Diferencia lecturas (m³)
                <input
                  type="number"
                  step="0.001"
                  value={billDraft.readingDifferenceM3}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      readingDifferenceM3: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                m³ descontados
                <input
                  type="number"
                  step="0.001"
                  value={billDraft.deductibleM3}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      deductibleM3: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Consumo facturado (m³)
                <input
                  type="number"
                  step="0.001"
                  value={billDraft.billedM3}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      billedM3: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Total a pagar
                <input
                  type="number"
                  value={billDraft.amountClp}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      amountClp: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Número de cuenta
                <input
                  value={billDraft.customerNumber}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      customerNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Número de boleta
                <input
                  value={billDraft.invoiceNumber}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      invoiceNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Número de medidor
                <input
                  value={billDraft.meterNumber}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      meterNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Marca medidor
                <input
                  value={billDraft.meterBrand}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      meterBrand: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="wide">
                Dirección de servicio
                <input
                  value={billDraft.serviceAddress}
                  onChange={(event) =>
                    setBillDraft((current) => ({
                      ...current,
                      serviceAddress: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <details className="water-charge-fields">
              <summary>Revisar desglose de costos</summary>
              <div>
                <label>
                  Cargo fijo
                  <input
                    type="number"
                    value={billDraft.fixedChargeClp}
                    onChange={(event) =>
                      setBillDraft((current) => ({
                        ...current,
                        fixedChargeClp: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Agua potable
                  <input
                    type="number"
                    value={billDraft.potableWaterChargeClp}
                    onChange={(event) =>
                      setBillDraft((current) => ({
                        ...current,
                        potableWaterChargeClp: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Recolección aguas servidas
                  <input
                    type="number"
                    value={billDraft.sewerCollectionChargeClp}
                    onChange={(event) =>
                      setBillDraft((current) => ({
                        ...current,
                        sewerCollectionChargeClp: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Tratamiento aguas servidas
                  <input
                    type="number"
                    value={billDraft.wastewaterTreatmentChargeClp}
                    onChange={(event) =>
                      setBillDraft((current) => ({
                        ...current,
                        wastewaterTreatmentChargeClp: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Subtotal servicio
                  <input
                    type="number"
                    value={billDraft.subtotalServiceClp}
                    onChange={(event) =>
                      setBillDraft((current) => ({
                        ...current,
                        subtotalServiceClp: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  IVA / impuestos
                  <input
                    type="number"
                    value={billDraft.taxesClp}
                    onChange={(event) =>
                      setBillDraft((current) => ({
                        ...current,
                        taxesClp: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Otros cargos / convenio
                  <input
                    type="number"
                    value={billDraft.otherChargesClp}
                    onChange={(event) =>
                      setBillDraft((current) => ({
                        ...current,
                        otherChargesClp: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Descuentos
                  <input
                    type="number"
                    value={billDraft.discountsClp}
                    onChange={(event) =>
                      setBillDraft((current) => ({
                        ...current,
                        discountsClp: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </details>
            <button
              className="water-save-bill"
              type="button"
              onClick={() => void saveBill()}
              disabled={billBusy}
            >
              <Save /> {billBusy ? "Guardando…" : "Guardar igualmente"}
            </button>
          </details>
        </section>
      ) : null}

      <section className="water-bill-history">
        <header>
          <div>
            <small>Archivo permanente</small>
            <h2>Cuentas guardadas</h2>
          </div>
          <span>
            {bills.length} {bills.length === 1 ? "cuenta" : "cuentas"}
          </span>
        </header>
        {bills.length ? (
          bills.map((bill) => (
            <details className="panel water-bill-row" key={bill.id}>
              <summary>
                <div>
                  <small>
                    {bill.source === "photo-ai"
                      ? "Cuenta analizada con IA"
                      : bill.source === "meter-period"
                        ? "Cierre desde lecturas Mi Solar"
                        : "Ingreso manual"}
                  </small>
                  <h3>{monthLabel(billMonth(bill))}</h3>
                  <p>
                    {dateLabel(bill.periodStart)} → {dateLabel(bill.periodEnd)}{" "}
                    · {bill.periodDays} días
                  </p>
                </div>
                <span>
                  <small>Consumo</small>
                  <b>{m3(bill.billedM3)}</b>
                  <em className={bill.isEstimated ? "estimated" : "actual"}>
                    {bill.isEstimated ? "ESTIMADO" : "LECTURA REAL"}
                  </em>
                </span>
                <span>
                  <small>Promedio diario</small>
                  <b>{m3(bill.averageDailyM3, 2)}/día</b>
                </span>
                <span>
                  <small>Total a pagar</small>
                  <b>{clp(bill.amountClp)}</b>
                </span>
                <ChevronDown />
              </summary>
              <div className="water-bill-detail">
                <section>
                  <h4>Lecturas y consumo</h4>
                  <dl>
                    <div>
                      <dt>Clasificación automática</dt>
                      <dd>
                        {bill.consumptionStatus === "actual"
                          ? "Lectura real"
                          : "Consumo estimado"}
                      </dd>
                    </div>
                    <div>
                      <dt>Por qué</dt>
                      <dd>
                        {bill.classificationReason ||
                          "Clasificado según fechas y lecturas disponibles."}
                      </dd>
                    </div>
                    <div>
                      <dt>Lectura anterior</dt>
                      <dd>
                        {bill.previousReadingM3 == null
                          ? "No registra"
                          : m3(bill.previousReadingM3, 3)}
                      </dd>
                    </div>
                    <div>
                      <dt>Lectura actual</dt>
                      <dd>
                        {bill.currentReadingM3 == null
                          ? "No registra"
                          : m3(bill.currentReadingM3, 3)}
                      </dd>
                    </div>
                    <div>
                      <dt>Diferencia</dt>
                      <dd>
                        {bill.readingDifferenceM3 == null
                          ? "No registra"
                          : m3(bill.readingDifferenceM3)}
                      </dd>
                    </div>
                    <div>
                      <dt>Descontados</dt>
                      <dd>
                        {bill.deductibleM3 == null
                          ? "0 m³"
                          : m3(bill.deductibleM3)}
                      </dd>
                    </div>
                    <div>
                      <dt>Consumo facturado</dt>
                      <dd>{m3(bill.billedM3)}</dd>
                    </div>
                  </dl>
                </section>
                <section>
                  <h4>Datos de la cuenta</h4>
                  <dl>
                    <div>
                      <dt>Nº cuenta</dt>
                      <dd>{bill.customerNumber || "—"}</dd>
                    </div>
                    <div>
                      <dt>Nº boleta</dt>
                      <dd>{bill.invoiceNumber || "—"}</dd>
                    </div>
                    <div>
                      <dt>Vencimiento</dt>
                      <dd>{dateLabel(bill.dueDate)}</dd>
                    </div>
                    <div>
                      <dt>Próxima lectura</dt>
                      <dd>{dateLabel(bill.nextReadingDate)}</dd>
                    </div>
                    <div>
                      <dt>Medidor</dt>
                      <dd>
                        {[bill.meterBrand, bill.meterNumber]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Dirección</dt>
                      <dd>{bill.serviceAddress || "—"}</dd>
                    </div>
                  </dl>
                </section>
                <section className="wide">
                  <h4>Desglose completo</h4>
                  <div className="water-charges">
                    {bill.chargeItems.length ? (
                      bill.chargeItems.map((item, index) => (
                        <span key={`${item.label}-${index}`}>
                          <b>{item.label}</b>
                          <small>
                            {item.cubicMeters == null
                              ? ""
                              : m3(item.cubicMeters)}
                          </small>
                          <strong>{clp(item.amountClp)}</strong>
                        </span>
                      ))
                    ) : (
                      <>
                        <span>
                          <b>Cargo fijo</b>
                          <strong>{clp(bill.fixedChargeClp || 0)}</strong>
                        </span>
                        <span>
                          <b>Agua potable</b>
                          <strong>
                            {clp(bill.potableWaterChargeClp || 0)}
                          </strong>
                        </span>
                        <span>
                          <b>Recolección</b>
                          <strong>
                            {clp(bill.sewerCollectionChargeClp || 0)}
                          </strong>
                        </span>
                        <span>
                          <b>Tratamiento</b>
                          <strong>
                            {clp(bill.wastewaterTreatmentChargeClp || 0)}
                          </strong>
                        </span>
                        <span>
                          <b>Otros</b>
                          <strong>{clp(bill.otherChargesClp || 0)}</strong>
                        </span>
                      </>
                    )}
                  </div>
                </section>
                {bill.documents.length ? (
                  <section className="wide">
                    <h4>Fotografías respaldadas</h4>
                    <div className="water-document-grid">
                      {bill.documents.map((document) => (
                        <button
                          key={document.id}
                          onClick={() =>
                            setViewDocument({
                              kind: "bill",
                              id: document.id,
                              title: `${monthLabel(billMonth(bill))} · página ${document.pageNumber}`,
                            })
                          }
                        >
                          <img
                            loading="lazy"
                            src={`/api/devices/${encodeURIComponent(deviceSn)}/water-bills/documents/${document.id}`}
                            alt={`Página ${document.pageNumber}`}
                          />
                          <span>Página {document.pageNumber}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
                <footer className="wide">
                  <span>
                    Tarifa servicio:{" "}
                    {bill.unitServiceRateClp == null
                      ? "no calculable"
                      : `${clp(bill.unitServiceRateClp)} por m³`}
                  </span>
                  <button
                    className="danger"
                    onClick={() => void removeBill(bill)}
                  >
                    <Trash2 /> Eliminar
                  </button>
                </footer>
              </div>
            </details>
          ))
        ) : (
          <div className="panel water-history-empty">
            <Droplets />
            <b>No hay cuentas guardadas todavía</b>
            <p>
              La primera que ingreses aparecerá aquí con su detalle y
              fotografías.
            </p>
          </div>
        )}
      </section>

      {viewDocument ? (
        <div
          className="water-document-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={viewDocument.title}
          onClick={(event) =>
            event.target === event.currentTarget && setViewDocument(null)
          }
        >
          <header>
            <div>
              <strong>{viewDocument.title}</strong>
              <small>Documento privado de Mi Solar</small>
            </div>
            <button onClick={() => setViewDocument(null)}>
              <X /> Cerrar y volver
            </button>
          </header>
          <img
            src={
              viewDocument.kind === "bill"
                ? `/api/devices/${encodeURIComponent(deviceSn)}/water-bills/documents/${viewDocument.id}`
                : `/api/devices/${encodeURIComponent(deviceSn)}/water-meter/readings/${viewDocument.id}/photo`
            }
            alt={viewDocument.title}
          />
        </div>
      ) : null}
    </section>
  );
}
