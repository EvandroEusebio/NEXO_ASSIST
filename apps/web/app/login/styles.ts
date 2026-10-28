export const styles = {
  screen:
    "grid min-h-svh grid-cols-[5fr_4fr] bg-background text-[14px] text-foreground [color-scheme:light] max-[900px]:grid-cols-1",
  presentation:
    "flex min-h-svh flex-col bg-[#1b2431] px-16 pt-10 pb-12 text-white max-[1200px]:px-10 max-[900px]:min-h-0 max-[900px]:px-8 max-[900px]:pt-7 max-[900px]:pb-9 max-[480px]:px-6",
  brand: "flex items-center gap-2.5 text-lg font-[650] tracking-[-0.5px]",
  story: "mt-[clamp(70px,12.8vh,116px)] max-[900px]:mt-11 max-[480px]:mt-8",
  eyebrow: "mb-3 text-white/55",
  headline:
    "max-w-[660px] font-serif text-[clamp(40px,3.75vw,54px)] leading-[1.06] font-normal tracking-[-1.6px] max-[900px]:max-w-[650px] max-[900px]:text-[42px] max-[480px]:text-4xl",
  description:
    "mt-[26px] max-w-[510px] text-base leading-[25px] text-white/65 max-[900px]:mt-5 max-[480px]:text-sm max-[480px]:leading-[22px]",
  preview:
    "mx-auto mt-9 block w-[min(100%,502px)] rounded-[17px] border border-white/7 bg-[#232b38] p-[17px] text-[13px] max-[900px]:hidden",
  question:
    "ml-auto w-fit max-w-full rounded-[12px_12px_4px_12px] bg-white px-3.5 py-2 leading-[19px] text-foreground",
  activity: "mt-[9px] text-xs leading-[21px] text-white/40",
  activityName: "mr-1 font-medium text-white/75",
  answer:
    "max-w-[380px] rounded-[0_12px_12px_12px] bg-[#333a46] px-3.5 py-2.5 leading-[21px]",
  ticket:
    "mt-1.5 flex w-fit flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-[5px] text-xs text-foreground",
  ticketDot: "size-[7px] rounded-full bg-[#f5a500]",
  stats:
    "mt-auto grid grid-cols-3 border-t border-white/7 pt-[23px] max-[1200px]:[&_span]:text-[11px] max-[900px]:hidden",
  statItem:
    "border-l border-white/7 pl-6 first:border-0 first:pl-0 max-[1200px]:pl-3.5",
  statValue: "mb-[7px] font-serif text-[34px] leading-9",
  statLabel: "text-[13px] text-white/55",
  statDot: "inline-block size-2 rounded-full bg-[#00bd6c] align-middle",
  authentication:
    "flex min-w-0 flex-col px-14 pt-[39px] pb-[38px] max-[1200px]:px-9 max-[900px]:px-8 max-[900px]:py-7 max-[480px]:px-6",
  support:
    "text-right text-[13px] whitespace-nowrap text-muted-foreground max-[900px]:text-left max-[900px]:whitespace-normal",
  supportLink: "ml-1 font-medium text-[#0069c7] hover:underline",
  formPanel:
    "mx-auto mt-[max(90px,calc(26.1vh_-_58px))] w-[380px] max-w-full max-[900px]:mt-11 max-[900px]:w-[440px]",
  formTitle:
    "font-serif text-[40px] leading-[1.2] font-normal tracking-[-0.8px] max-[480px]:text-4xl",
  subtitle:
    "mt-3 text-[15px] whitespace-nowrap text-muted-foreground max-[1200px]:whitespace-normal",
  form: "mt-[27px] border-b border-border pb-[27px]",
  field: "space-y-1.5",
  nextField: "mt-[17px]",
  fieldLabel: "text-sm",
  inputWrap:
    "flex h-[46px] items-center gap-2.5 rounded-[9px] border border-border px-3.5 text-muted-foreground shadow-[0_1px_2px_#1b243108] focus-within:border-ring focus-within:shadow-[0_0_0_1px_#0285f7]",
  input:
    "h-full w-full min-w-0 border-0 bg-transparent p-0 text-foreground shadow-none outline-none focus-visible:border-0 focus-visible:ring-0",
  passwordWrap: "border-ring [&>svg]:text-ring",
  passwordInput: "placeholder:tracking-[4px] placeholder:text-foreground",
  passwordLabel: "flex items-center justify-between",
  textLink:
    "h-auto cursor-pointer border-0 bg-transparent p-0 text-[13px] text-[#0069c7] hover:underline",
  eye: "cursor-pointer px-0 py-1.5 pl-1.5 text-muted-foreground",
  remember: "mt-[18px] flex items-center gap-[9px] text-[13px] text-[#3d4656]",
  checkbox: "size-[18px] cursor-pointer",
  rememberLabel: "cursor-pointer text-[13px] font-normal",
  submit:
    "mt-7 flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground shadow-[0_6px_14px_#0062c426] hover:bg-[#0055ab] disabled:cursor-wait disabled:opacity-60",
  error: "mt-4 rounded-md bg-[#fdf0f1] p-2.5 text-destructive",
  footer:
    "mt-auto flex items-center justify-between gap-5 pt-10 text-xs text-muted-foreground max-[900px]:flex-wrap max-[900px]:pt-14",
  dialog:
    "mx-auto w-[calc(100vw_-_40px)] max-w-[460px] rounded-[14px] bg-white p-8 text-foreground shadow-[0_20px_70px_#0004] sm:max-w-[460px]",
  dialogLink: "mt-4 inline-block text-[#0069c7] hover:underline",
} as const
