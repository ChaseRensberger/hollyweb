import { useState } from "react";
import { ThemeToggle } from "../src/components/theme-toggle";
import { Input } from "../src/components/core/input";
import { AccordionShowcase } from "../src/showcases/accordion-showcase";
import { AlertDialogShowcase } from "../src/showcases/alert-dialog-showcase";
import { AlertShowcase } from "../src/showcases/alert-showcase";
import { AspectRatioShowcase } from "../src/showcases/aspect-ratio-showcase";
import { AvatarShowcase } from "../src/showcases/avatar-showcase";
import { BadgeShowcase } from "../src/showcases/badge-showcase";
import { BreadcrumbShowcase } from "../src/showcases/breadcrumb-showcase";
import { ButtonGroupShowcase } from "../src/showcases/button-group-showcase";
import { ButtonShowcase } from "../src/showcases/button-showcase";
import { CardShowcase } from "../src/showcases/card-showcase";
import { CheckboxShowcase } from "../src/showcases/checkbox-showcase";
import { CollapsibleShowcase } from "../src/showcases/collapsible-showcase";
import { ComboboxShowcase } from "../src/showcases/combobox-showcase";
import { ContextMenuShowcase } from "../src/showcases/context-menu-showcase";
import { DataTableShowcase } from "../src/showcases/data-table-showcase";
import { DialogShowcase } from "../src/showcases/dialog-showcase";
import { DrawerShowcase } from "../src/showcases/drawer-showcase";
import { DropdownMenuShowcase } from "../src/showcases/dropdown-menu-showcase";
import { EmptyShowcase } from "../src/showcases/empty-showcase";
import { FieldShowcase } from "../src/showcases/field-showcase";
import { HoverCardShowcase } from "../src/showcases/hover-card-showcase";
import { InputGroupShowcase } from "../src/showcases/input-group-showcase";
import { InputOTPShowcase } from "../src/showcases/input-otp-showcase";
import { InputShowcase } from "../src/showcases/input-showcase";
import { ItemShowcase } from "../src/showcases/item-showcase";
import { KbdShowcase } from "../src/showcases/kbd-showcase";
import { LabelShowcase } from "../src/showcases/label-showcase";
import { MarkdownShowcase } from "../src/showcases/markdown-showcase";
import { MenubarShowcase } from "../src/showcases/menubar-showcase";
import { NativeSelectShowcase } from "../src/showcases/native-select-showcase";
import { NavigationMenuShowcase } from "../src/showcases/navigation-menu-showcase";
import { PaginationShowcase } from "../src/showcases/pagination-showcase";
import { PopoverShowcase } from "../src/showcases/popover-showcase";
import { ProgressShowcase } from "../src/showcases/progress-showcase";
import { RadioGroupShowcase } from "../src/showcases/radio-group-showcase";
import { ScrollAreaShowcase } from "../src/showcases/scroll-area-showcase";
import { SelectShowcase } from "../src/showcases/select-showcase";
import { SeparatorShowcase } from "../src/showcases/separator-showcase";
import { SheetShowcase } from "../src/showcases/sheet-showcase";
import { SidebarShowcase } from "../src/showcases/sidebar-showcase";
import { SkeletonShowcase } from "../src/showcases/skeleton-showcase";
import { SliderShowcase } from "../src/showcases/slider-showcase";
import { SpinnerShowcase } from "../src/showcases/spinner-showcase";
import { SwitchShowcase } from "../src/showcases/switch-showcase";
import { TableShowcase } from "../src/showcases/table-showcase";
import { TabsShowcase } from "../src/showcases/tabs-showcase";
import { TextareaShowcase } from "../src/showcases/textarea-showcase";
import { ThemePreviewSwitcherShowcase } from "../src/showcases/theme-preview-switcher-showcase";
import { ToastShowcase } from "../src/showcases/toast-showcase";
import { ToggleGroupShowcase } from "../src/showcases/toggle-group-showcase";
import { ToggleShowcase } from "../src/showcases/toggle-showcase";
import { TooltipShowcase } from "../src/showcases/tooltip-showcase";
import { TypographyShowcase } from "../src/showcases/typography-showcase";

const catalog = {
  Accordion: AccordionShowcase,
  "Alert dialog": AlertDialogShowcase,
  Alert: AlertShowcase,
  "Aspect ratio": AspectRatioShowcase,
  Avatar: AvatarShowcase,
  Badge: BadgeShowcase,
  Breadcrumb: BreadcrumbShowcase,
  "Button group": ButtonGroupShowcase,
  Button: ButtonShowcase,
  Card: CardShowcase,
  Checkbox: CheckboxShowcase,
  Collapsible: CollapsibleShowcase,
  Combobox: ComboboxShowcase,
  "Context menu": ContextMenuShowcase,
  "Data table": DataTableShowcase,
  Dialog: DialogShowcase,
  Drawer: DrawerShowcase,
  "Dropdown menu": DropdownMenuShowcase,
  Empty: EmptyShowcase,
  Field: FieldShowcase,
  "Hover card": HoverCardShowcase,
  "Input group": InputGroupShowcase,
  "Input OTP": InputOTPShowcase,
  Input: InputShowcase,
  Item: ItemShowcase,
  Kbd: KbdShowcase,
  Label: LabelShowcase,
  Markdown: MarkdownShowcase,
  Menubar: MenubarShowcase,
  "Native select": NativeSelectShowcase,
  "Navigation menu": NavigationMenuShowcase,
  Pagination: PaginationShowcase,
  Popover: PopoverShowcase,
  Progress: ProgressShowcase,
  "Radio group": RadioGroupShowcase,
  "Scroll area": ScrollAreaShowcase,
  Select: SelectShowcase,
  Separator: SeparatorShowcase,
  Sheet: SheetShowcase,
  Sidebar: SidebarShowcase,
  Skeleton: SkeletonShowcase,
  Slider: SliderShowcase,
  Spinner: SpinnerShowcase,
  Switch: SwitchShowcase,
  Table: TableShowcase,
  Tabs: TabsShowcase,
  Textarea: TextareaShowcase,
  Theme: ThemePreviewSwitcherShowcase,
  Toast: ToastShowcase,
  "Toggle group": ToggleGroupShowcase,
  Toggle: ToggleShowcase,
  Tooltip: TooltipShowcase,
  Typography: TypographyShowcase,
};

export function Gallery() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<keyof typeof catalog>("Button");
  const Component = catalog[selected];
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="holly-section-label">Hollyweb / Core</p>
          <h1 className="mt-3 text-4xl font-medium">Components</h1>
        </div>
        <ThemeToggle />
      </header>
      <div className="grid gap-8 md:grid-cols-[210px_1fr]">
        <aside>
          <Input
            aria-label="Find a component"
            placeholder="Find a component…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <nav
            aria-label="Component catalog"
            className="mt-4 flex max-h-[60vh] flex-col gap-1 overflow-auto"
          >
            {(Object.keys(catalog) as (keyof typeof catalog)[])
              .filter((name) => name.toLowerCase().includes(search.toLowerCase()))
              .map((name) => (
                <button
                  key={name}
                  aria-current={selected === name ? "page" : undefined}
                  onClick={() => setSelected(name)}
                  className={`rounded-md px-3 py-2 text-left text-sm ${selected === name ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {name}
                </button>
              ))}
          </nav>
        </aside>
        <section className="min-w-0 rounded-md border bg-card px-6">
          <Component key={selected} />
        </section>
      </div>
    </main>
  );
}
