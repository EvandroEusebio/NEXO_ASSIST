export const styles = {
  screen:
    "grid h-svh grid-cols-[232px_minmax(0,1fr)] bg-background text-sm text-foreground [color-scheme:light] max-[1050px]:grid-cols-[200px_minmax(0,1fr)] max-[700px]:grid-cols-1 max-[700px]:grid-rows-[auto_minmax(0,1fr)]",
  sidebar:
    "flex min-h-0 flex-col border-r border-border px-3.5 py-5 max-[700px]:grid max-[700px]:grid-cols-[1fr_auto] max-[700px]:items-center max-[700px]:gap-2 max-[700px]:border-r-0 max-[700px]:border-b max-[700px]:px-4 max-[700px]:py-2.5",
  brand:
    "flex items-center gap-2.5 px-2 pb-[22px] text-base font-[650] max-[700px]:p-0 [&_svg]:text-[#037af6]",
  nav: "grid gap-1 max-[700px]:flex max-[700px]:text-xs",
  navItem:
    "flex items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-left text-[#3d4656]",
  active: "bg-accent font-medium text-accent-foreground ",
  history:
    "my-2 flex min-w-0 flex-wrap items-center gap-2.5 max-[700px]:col-span-2 max-[700px]:m-0 max-[700px]:flex max-[700px]:items-center",
  historyButton:
    "flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-[9px] text-left text-[#3d4656] max-[700px]:shrink-0 max-[700px]:p-[7px] max-[700px]:text-xs",
  historyLabel: "mt-2.5 text-xs text-muted-foreground max-[700px]:hidden",
  historySelect:
    "min-w-0 max-w-full flex-1 rounded-md border border-border p-2 text-xs [&>span]:truncate max-[700px]:min-w-0 max-[700px]:flex-1",
  account: "mt-auto border-t border-border pt-3.5 max-[700px]:hidden",
  identity: "mb-3 flex items-center gap-2.5",
  identityName: "text-[13px] font-medium",
  identityEmail:
    "block text-[11px] text-muted-foreground [overflow-wrap:anywhere]",
  avatar:
    "grid size-[34px] shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground",
  avatarFallback: "bg-accent text-xs font-semibold text-accent-foreground",
  workspace: "flex min-h-0 min-w-0 flex-col",
  header:
    "flex h-16 shrink-0 items-center justify-between gap-[15px] border-b border-border px-8 text-[13px] max-[1050px]:px-5 max-[700px]:h-12 max-[700px]:px-4 max-[700px]:text-[11px]",
  breadcrumb:
    "flex items-center gap-3 text-muted-foreground max-[700px]:gap-[5px]",
  headerTitle: "font-medium text-foreground",
  online:
    "rounded-full bg-[#ecfaf4] px-2.5 py-1 text-xs whitespace-nowrap text-[#00804a] max-[700px]:text-[10px]",
  waitingBadge:
    "rounded-full bg-[#fff6e5] px-2.5 py-1 text-xs whitespace-nowrap text-[#946300] max-[700px]:text-[10px]",
  scroll: "min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]",
  messages:
    "mx-auto w-[calc(100%_-_48px)] max-w-[808px] pt-[40px] pb-3.5 max-[1050px]:pt-[30px] max-[700px]:w-[calc(100%_-_28px)] max-[700px]:pt-3",
  welcome: "py-10",
  welcomeTitle: "mb-3 text-[28px]",
  welcomeDescription: "mb-5 leading-[1.6] text-muted-foreground",
  employeeMessage: "my-5 flex justify-end",
  assistantMessage: "my-[18px]",
  bubble:
    "max-w-[600px] rounded-[3px_14px_14px_14px] border border-border px-4 py-3 leading-[22px] whitespace-pre-wrap [overflow-wrap:anywhere] max-[700px]:text-[13px]",
  employeeBubble:
    "max-w-[520px] rounded-[14px_14px_3px_14px] border-[#1b2431] bg-[#1b2431] text-white",
  messageLabel: "mb-1 flex flex-wrap items-center gap-3.5 text-xs",
  messageAuthor: "font-medium",
  messageActivity: "flex items-center gap-1.5 text-muted-foreground",
  options: "mt-3 flex flex-wrap gap-1.5",
  optionButton:
    "h-auto rounded-lg border border-border bg-white px-3 py-[7px] text-[13px] hover:bg-accent",
  primary:
    "inline-flex h-auto items-center justify-center gap-[7px] rounded-[7px] border-0 bg-primary px-3.5 py-[9px] font-semibold text-primary-foreground hover:bg-[#0055ab]",
  card: "mt-1.5 block overflow-hidden rounded-[17px] border border-border bg-card px-[18px] py-4 text-card-foreground shadow-[0_1px_3px_#1b24310b] max-[700px]:p-3.5",
  cardHeading:
    "mb-[7px] flex flex-wrap justify-between gap-2 text-xs text-muted-foreground",
  cardTitle:
    "mb-1.5 text-lg font-semibold [overflow-wrap:anywhere] max-[700px]:text-base",
  cardDescription:
    "text-[13px] leading-[21px] whitespace-pre-wrap text-[#3d4656] [overflow-wrap:anywhere]",
  facts:
    "mt-3.5 flex flex-wrap gap-5 border-t border-border pt-2.5 max-[700px]:gap-3",
  fact: "min-w-[130px] flex-1",
  factLabel: "mb-[3px] text-xs text-muted-foreground",
  factValue: "text-sm",
  warning: "text-[#946300]",
  cardActions:
    "-mx-[18px] -mb-4 mt-4 flex gap-1.5 border-t border-border bg-muted p-2 max-[700px]:-mx-3.5 max-[700px]:-mb-3.5 max-[700px]:mt-3.5",
  ticketList:
    "mt-1.5 overflow-hidden rounded-2xl border border-border shadow-[0_2px_4px_#1b243108]",
  ticketButton:
    "flex h-auto w-full items-center justify-start gap-3 rounded-none border-0 border-b border-border px-4 py-[13px] text-left whitespace-normal last:border-b-0 hover:bg-accent max-[1050px]:flex-wrap",
  ticketTitle: "flex-1 font-medium max-[1050px]:basis-[65%]",
  ticketMeta: "text-xs text-muted-foreground",
  radio: "size-4 shrink-0 rounded-full border border-[#cbd0d8]",
  composerArea:
    "mx-auto w-[calc(100%_-_48px)] max-w-[808px] pb-4 max-[700px]:w-[calc(100%_-_28px)] max-[700px]:pb-2.5",
  composer:
    "flex items-center gap-2 rounded-xl border border-border bg-white p-[5px] focus-within:border-ring",
  composerInput:
    "max-h-28 min-h-9 min-w-0 flex-1 resize-y rounded-none border-0 bg-transparent px-2.5 py-[7px] shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0 ",
  counter: "mt-[5px] text-right text-xs text-muted-foreground",
  notice:
    "my-2.5 rounded-lg bg-[#fff6e5] px-3 py-2.5 text-[13px] text-[#946300]",
  noticeButton: "ml-1.5 h-auto p-0 text-inherit underline",
  pending: "my-3 text-[13px] text-muted-foreground",
  error: "mb-2 rounded-lg bg-[#fdf0f1] px-3 py-2.5 text-destructive",
  errorButton: "ml-2.5 h-auto p-0 text-inherit underline",
  editor: "block",
  editorField: "mt-3 grid gap-1.5 text-[13px]",
  editorControl:
    "h-auto min-h-[38px] w-full rounded-md border border-border bg-white p-[9px] whitespace-normal",
  editorGrid: "grid grid-cols-3 gap-3 max-[700px]:grid-cols-1",
  editorHint: "mt-2.5",
  dialog:
    "mx-auto w-[calc(100vw_-_40px)] max-w-[calc(100vw_-_40px)] rounded-[14px] bg-white p-8 text-foreground sm:max-w-sm",
  dialogTitle: "mb-[18px] text-2xl",
  dialogText: "my-2",
  dialogLink: "mt-4 inline-block text-[#0069c7] underline",
} as const
