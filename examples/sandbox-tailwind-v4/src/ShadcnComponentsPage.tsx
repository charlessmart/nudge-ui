import { useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  BellIcon,
  CheckIcon,
  CircleHelpIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Attachment,
  AttachmentAction,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from "@/components/ui/bubble";
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@/components/ui/button-group";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DirectionProvider } from "@/components/ui/direction";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnaireProgress,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ComponentCardProps = {
  name: string;
  source: string;
  children: ReactNode;
  className?: string;
};

function ComponentCard({ name, source, children, className = "" }: ComponentCardProps) {
  const identity = import.meta.env.DEV
    ? {
        "data-cid": `Shadcn:${name}`,
        "data-src": `src/components/ui/${source}.tsx`,
        "data-test": `shadcn-${source}`,
      }
    : {};

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-foreground">{name}</h3>
        <code className="truncate text-[10px] text-muted-foreground">{source}.tsx</code>
      </header>
      <div className={`flex min-h-32 items-center justify-center p-5 ${className}`} {...identity}>
        {children}
      </div>
    </article>
  );
}

function GallerySection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-10 lg:px-10" aria-labelledby={`shadcn-${label}`}>
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-3">
        <h2 id={`shadcn-${label}`} className="text-lg font-semibold tracking-tight">{label}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">generated component source</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

const chartConfig = {
  views: { label: "Views", color: "var(--chart-2)" },
} satisfies ChartConfig;

const chartData = [
  { day: "Mon", views: 28 },
  { day: "Tue", views: 42 },
  { day: "Wed", views: 35 },
  { day: "Thu", views: 58 },
  { day: "Fri", views: 47 },
];

const comboItems = ["React", "Tailwind", "Radix", "Vite"];

export function ShadcnComponentsPage() {
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(new Date(2025, 0, 15));

  return (
    <TooltipProvider>
      <main className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-12 lg:px-10">
            <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span className="rounded-full border border-border px-3 py-1">Dev-only showroom</span>
              <span>Tailwind v4</span>
              <span>·</span>
              <span>shadcn/ui</span>
            </div>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_22rem] md:items-end">
              <div>
                <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.06em] sm:text-7xl">Every component.<br />One inspectable surface.</h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
                  The current shadcn registry, installed as local source and rendered as a single parsing fixture. Select a component to inspect its generated boundary, composed primitives, and authored props.
                </p>
              </div>
              <Card className="bg-muted/40">
                <CardHeader className="pb-3">
                  <CardDescription>Installed surface</CardDescription>
                  <CardTitle className="text-4xl tracking-[-0.06em]">61 components</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
                  <SparklesIcon className="size-4 text-primary" />
                  <span>Radix Nova · local registry output</span>
                </CardContent>
              </Card>
            </div>
          </div>
        </header>

        <GallerySection label="Foundations">
          <ComponentCard name="Accordion" source="accordion">
            <Accordion type="single" collapsible defaultValue="details" className="w-full max-w-sm">
              <AccordionItem value="details">
                <AccordionTrigger>What is inspectable?</AccordionTrigger>
                <AccordionContent>Component props, composed primitives, and generated utility classes.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </ComponentCard>
          <ComponentCard name="Alert" source="alert">
            <Alert className="max-w-sm">
              <CircleHelpIcon />
              <AlertTitle>Heads up</AlertTitle>
              <AlertDescription>This alert is a real shadcn composition.</AlertDescription>
            </Alert>
          </ComponentCard>
          <ComponentCard name="Aspect Ratio" source="aspect-ratio">
            <AspectRatio ratio={16 / 9} className="w-full max-w-xs overflow-hidden rounded-lg bg-muted">
              <div className="grid size-full place-items-center text-sm text-muted-foreground">16 : 9</div>
            </AspectRatio>
          </ComponentCard>
          <ComponentCard name="Avatar" source="avatar">
            <AvatarGroup>
              <Avatar><AvatarFallback>AL</AvatarFallback></Avatar>
              <Avatar><AvatarFallback>MK</AvatarFallback></Avatar>
              <AvatarGroupCount>+4</AvatarGroupCount>
            </AvatarGroup>
          </ComponentCard>
          <ComponentCard name="Badge" source="badge">
            <div className="flex flex-wrap justify-center gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </div>
          </ComponentCard>
          <ComponentCard name="Button" source="button">
            <div className="flex flex-wrap justify-center gap-2">
              <Button>Continue <ArrowRightIcon /></Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost" size="icon" aria-label="Settings"><SettingsIcon /></Button>
            </div>
          </ComponentCard>
          <ComponentCard name="Card" source="card">
            <Card className="w-full max-w-sm">
              <CardHeader><CardTitle>Project brief</CardTitle><CardDescription>A compact content surface.</CardDescription></CardHeader>
              <CardContent className="text-sm text-muted-foreground">Three layers make the structure clear.</CardContent>
            </Card>
          </ComponentCard>
          <ComponentCard name="Empty" source="empty">
            <Empty className="w-full max-w-sm border border-dashed">
              <EmptyHeader><EmptyMedia variant="icon"><FileTextIcon /></EmptyMedia><EmptyTitle>No drafts yet</EmptyTitle><EmptyDescription>Start a document to see it here.</EmptyDescription></EmptyHeader>
              <EmptyContent><Button size="sm">Create draft</Button></EmptyContent>
            </Empty>
          </ComponentCard>
          <ComponentCard name="Kbd" source="kbd">
            <KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd><span className="px-1 text-xs text-muted-foreground">to search</span></KbdGroup>
          </ComponentCard>
          <ComponentCard name="Label" source="label">
            <div className="grid w-full max-w-xs gap-2"><Label htmlFor="label-demo">Workspace name</Label><Input id="label-demo" defaultValue="Northline" /></div>
          </ComponentCard>
          <ComponentCard name="Marker" source="marker">
            <Marker variant="border"><MarkerIcon><CheckIcon /></MarkerIcon><MarkerContent>Ready for review</MarkerContent></Marker>
          </ComponentCard>
          <ComponentCard name="Progress" source="progress">
            <div className="grid w-full max-w-xs gap-2"><div className="flex justify-between text-xs"><span>Build progress</span><span>68%</span></div><Progress value={68} /></div>
          </ComponentCard>
          <ComponentCard name="Separator" source="separator" className="flex-col gap-4">
            <span className="text-sm">Above the rule</span><Separator className="w-full" /><span className="text-sm">Below the rule</span>
          </ComponentCard>
          <ComponentCard name="Skeleton" source="skeleton" className="flex-col items-stretch gap-3">
            <Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-20 w-full rounded-lg" />
          </ComponentCard>
          <ComponentCard name="Spinner" source="spinner">
            <div className="flex items-center gap-3 text-sm text-muted-foreground"><Spinner /> Saving changes…</div>
          </ComponentCard>
        </GallerySection>

        <GallerySection label="Forms and controls">
          <ComponentCard name="Checkbox" source="checkbox">
            <Field orientation="horizontal" className="w-auto"><Checkbox id="terms" defaultChecked /><FieldLabel htmlFor="terms">Accept terms</FieldLabel></Field>
          </ComponentCard>
          <ComponentCard name="Field" source="field">
            <Field className="w-full max-w-sm"><FieldLabel htmlFor="field-email">Email address</FieldLabel><Input id="field-email" placeholder="you@example.com" /><FieldDescription>We only use this for project updates.</FieldDescription></Field>
          </ComponentCard>
          <ComponentCard name="Input" source="input">
            <Input className="max-w-xs" placeholder="Search projects" />
          </ComponentCard>
          <ComponentCard name="Input Group" source="input-group">
            <InputGroup className="max-w-xs"><InputGroupAddon><InputGroupText><SearchIcon /></InputGroupText></InputGroupAddon><InputGroupInput placeholder="Filter results" /><InputGroupAddon align="inline-end"><InputGroupButton aria-label="Clear" size="icon-xs"><XIcon /></InputGroupButton></InputGroupAddon></InputGroup>
          </ComponentCard>
          <ComponentCard name="Input OTP" source="input-otp">
            <InputOTP maxLength={4} defaultValue="2036"><InputOTPGroup><InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} /><InputOTPSlot index={3} /></InputOTPGroup></InputOTP>
          </ComponentCard>
          <ComponentCard name="Native Select" source="native-select">
            <NativeSelect defaultValue="weekly"><NativeSelectOption value="daily">Daily digest</NativeSelectOption><NativeSelectOption value="weekly">Weekly digest</NativeSelectOption><NativeSelectOption value="never">Never</NativeSelectOption></NativeSelect>
          </ComponentCard>
          <ComponentCard name="Radio Group" source="radio-group" className="flex-col items-stretch">
            <RadioGroup defaultValue="comfortable" className="w-full max-w-xs"><div className="flex items-center gap-2"><RadioGroupItem value="compact" id="compact" /><Label htmlFor="compact">Compact</Label></div><div className="flex items-center gap-2"><RadioGroupItem value="comfortable" id="comfortable" /><Label htmlFor="comfortable">Comfortable</Label></div></RadioGroup>
          </ComponentCard>
          <ComponentCard name="Select" source="select">
            <Select defaultValue="design"><SelectTrigger className="w-44"><SelectValue placeholder="Choose a mode" /></SelectTrigger><SelectContent><SelectItem value="design">Design mode</SelectItem><SelectItem value="content">Content mode</SelectItem><SelectItem value="review">Review mode</SelectItem></SelectContent></Select>
          </ComponentCard>
          <ComponentCard name="Slider" source="slider">
            <Slider defaultValue={[42]} max={100} step={1} className="w-full max-w-xs" aria-label="Volume" />
          </ComponentCard>
          <ComponentCard name="Switch" source="switch">
            <div className="flex items-center gap-3"><Switch id="notifications" defaultChecked /><Label htmlFor="notifications">Notifications</Label></div>
          </ComponentCard>
          <ComponentCard name="Textarea" source="textarea">
            <Textarea className="max-w-sm" placeholder="Add a note for the team…" />
          </ComponentCard>
          <ComponentCard name="Toggle" source="toggle">
            <div className="flex items-center gap-2"><Toggle aria-label="Bold" defaultPressed><span className="font-bold">B</span></Toggle><Toggle aria-label="Italic"><span className="italic">I</span></Toggle></div>
          </ComponentCard>
          <ComponentCard name="Toggle Group" source="toggle-group">
            <ToggleGroup type="single" defaultValue="center" variant="outline" aria-label="Text alignment"><ToggleGroupItem value="left" aria-label="Align left">L</ToggleGroupItem><ToggleGroupItem value="center" aria-label="Align center">C</ToggleGroupItem><ToggleGroupItem value="right" aria-label="Align right">R</ToggleGroupItem></ToggleGroup>
          </ComponentCard>
          <ComponentCard name="Questionnaire" source="questionnaire" className="items-stretch">
            <Questionnaire items={[{ name: "density", choices: [{ value: "focused" }, { value: "spacious" }] }]} defaultItem="density" className="w-full"><QuestionnaireProgress /><QuestionnaireItem name="density"><QuestionnaireTitle>How should this workspace feel?</QuestionnaireTitle><QuestionnaireDescription>Choose a starting point; you can change it later.</QuestionnaireDescription><QuestionnaireChoices><QuestionnaireChoice value="focused">Focused<br /><QuestionnaireChoiceDescription>Dense and efficient.</QuestionnaireChoiceDescription></QuestionnaireChoice><QuestionnaireChoice value="spacious">Spacious<br /><QuestionnaireChoiceDescription>Calm and open.</QuestionnaireChoiceDescription></QuestionnaireChoice></QuestionnaireChoices><QuestionnaireActions><QuestionnaireNext /></QuestionnaireActions></QuestionnaireItem></Questionnaire>
          </ComponentCard>
        </GallerySection>

        <GallerySection label="Navigation and overlays">
          <ComponentCard name="Alert Dialog" source="alert-dialog">
            <AlertDialog><AlertDialogTrigger asChild><Button variant="outline">Delete draft</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this draft?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
          </ComponentCard>
          <ComponentCard name="Breadcrumb" source="breadcrumb">
            <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="#">Projects</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink href="#">Northline</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Settings</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
          </ComponentCard>
          <ComponentCard name="Collapsible" source="collapsible">
            <Collapsible defaultOpen className="w-full max-w-sm"><div className="flex items-center justify-between gap-4"><span className="text-sm font-medium">Advanced settings</span><CollapsibleTrigger asChild><Button variant="ghost" size="sm">Toggle</Button></CollapsibleTrigger></div><CollapsibleContent className="pt-3 text-sm text-muted-foreground">More settings appear in this composed content region.</CollapsibleContent></Collapsible>
          </ComponentCard>
          <ComponentCard name="Command" source="command" className="items-stretch p-2">
            <Command className="max-w-sm border"><CommandInput placeholder="Type a command…" /><CommandList><CommandEmpty>No results.</CommandEmpty><CommandGroup heading="Suggestions"><CommandItem><SearchIcon /> Search files</CommandItem><CommandItem><SettingsIcon /> Open settings</CommandItem><CommandItem><BellIcon /> Review activity</CommandItem></CommandGroup></CommandList></Command>
          </ComponentCard>
          <ComponentCard name="Context Menu" source="context-menu">
            <ContextMenu><ContextMenuTrigger className="flex h-20 w-full max-w-xs items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Right click this panel</ContextMenuTrigger><ContextMenuContent><ContextMenuItem>Rename</ContextMenuItem><ContextMenuItem>Duplicate</ContextMenuItem><ContextMenuSeparator /><ContextMenuItem>Delete</ContextMenuItem></ContextMenuContent></ContextMenu>
          </ComponentCard>
          <ComponentCard name="Dialog" source="dialog">
            <Dialog><DialogTrigger asChild><Button variant="outline">Edit profile</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Edit profile</DialogTitle><DialogDescription>Update your public profile details.</DialogDescription></DialogHeader><Input defaultValue="Mara Chen" /><DialogFooter><Button>Save changes</Button></DialogFooter></DialogContent></Dialog>
          </ComponentCard>
          <ComponentCard name="Direction" source="direction">
            <DirectionProvider dir="rtl"><Button variant="outline">RTL-aware action <ArrowRightIcon /></Button></DirectionProvider>
          </ComponentCard>
          <ComponentCard name="Drawer" source="drawer">
            <Drawer><DrawerTrigger asChild><Button variant="outline">Open drawer</Button></DrawerTrigger><DrawerContent><DrawerHeader><DrawerTitle>Quick actions</DrawerTitle><DrawerDescription>Actions for the selected project.</DrawerDescription></DrawerHeader><DrawerFooter><DrawerClose asChild><Button variant="outline">Close</Button></DrawerClose></DrawerFooter></DrawerContent></Drawer>
          </ComponentCard>
          <ComponentCard name="Dropdown Menu" source="dropdown-menu">
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">More actions <MoreHorizontalIcon /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuLabel>Project</DropdownMenuLabel><DropdownMenuItem>Open</DropdownMenuItem><DropdownMenuItem>Share</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem>Archive</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </ComponentCard>
          <ComponentCard name="Hover Card" source="hover-card">
            <HoverCard><HoverCardTrigger asChild><Button variant="link">Hover for profile</Button></HoverCardTrigger><HoverCardContent><div className="flex gap-3"><Avatar><AvatarFallback>MC</AvatarFallback></Avatar><div><p className="text-sm font-medium">Mara Chen</p><p className="text-xs text-muted-foreground">Product lead · Wellington</p></div></div></HoverCardContent></HoverCard>
          </ComponentCard>
          <ComponentCard name="Menubar" source="menubar">
            <Menubar><MenubarMenu><MenubarTrigger>File</MenubarTrigger><MenubarContent><MenubarItem>New project</MenubarItem><MenubarItem>Open…</MenubarItem></MenubarContent></MenubarMenu><MenubarMenu><MenubarTrigger>View</MenubarTrigger><MenubarContent><MenubarItem>Zoom in</MenubarItem></MenubarContent></MenubarMenu></Menubar>
          </ComponentCard>
          <ComponentCard name="Navigation Menu" source="navigation-menu">
            <NavigationMenu><NavigationMenuList><NavigationMenuItem><NavigationMenuTrigger>Explore</NavigationMenuTrigger></NavigationMenuItem><NavigationMenuItem><NavigationMenuLink href="#">Documentation</NavigationMenuLink></NavigationMenuItem></NavigationMenuList></NavigationMenu>
          </ComponentCard>
          <ComponentCard name="Pagination" source="pagination">
            <Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#" /></PaginationItem><PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem><PaginationItem><PaginationLink href="#" isActive>2</PaginationLink></PaginationItem><PaginationItem><PaginationEllipsis /></PaginationItem><PaginationItem><PaginationNext href="#" /></PaginationItem></PaginationContent></Pagination>
          </ComponentCard>
          <ComponentCard name="Popover" source="popover">
            <Popover><PopoverTrigger asChild><Button variant="outline">Open details</Button></PopoverTrigger><PopoverContent className="w-64"><p className="text-sm font-medium">Popover content</p><p className="mt-1 text-xs text-muted-foreground">Floating content remains part of the component graph.</p></PopoverContent></Popover>
          </ComponentCard>
          <ComponentCard name="Sheet" source="sheet">
            <Sheet><SheetTrigger asChild><Button variant="outline">Open sheet</Button></SheetTrigger><SheetContent><SheetHeader><SheetTitle>Preferences</SheetTitle><SheetDescription>Choose how the inspector should present details.</SheetDescription></SheetHeader><div className="mt-6 grid gap-3"><Label htmlFor="sheet-name">Display name</Label><Input id="sheet-name" defaultValue="Inspector" /></div></SheetContent></Sheet>
          </ComponentCard>
          <ComponentCard name="Tabs" source="tabs" className="items-stretch">
            <Tabs defaultValue="overview" className="w-full max-w-sm"><TabsList className="w-full"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList><TabsContent value="overview" className="pt-3 text-sm text-muted-foreground">A focused overview panel.</TabsContent><TabsContent value="activity" className="pt-3 text-sm text-muted-foreground">Recent activity appears here.</TabsContent></Tabs>
          </ComponentCard>
          <ComponentCard name="Tooltip" source="tooltip">
            <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="Help"><CircleHelpIcon /></Button></TooltipTrigger><TooltipContent>Inspect component props</TooltipContent></Tooltip>
          </ComponentCard>
        </GallerySection>

        <GallerySection label="Data, media, and composition">
          <ComponentCard name="Attachment" source="attachment">
            <Attachment><AttachmentMedia><PaperclipIcon /></AttachmentMedia><AttachmentContent><AttachmentTitle>design-notes.pdf</AttachmentTitle><AttachmentDescription>2.4 MB · uploaded</AttachmentDescription></AttachmentContent><AttachmentAction aria-label="Remove"><XIcon /></AttachmentAction></Attachment>
          </ComponentCard>
          <ComponentCard name="Bubble" source="bubble" className="items-stretch">
            <BubbleGroup className="w-full max-w-sm"><Bubble><BubbleContent>Here is the latest component inventory.</BubbleContent><BubbleReactions><Badge variant="secondary">Helpful · 4</Badge></BubbleReactions></Bubble></BubbleGroup>
          </ComponentCard>
          <ComponentCard name="Button Group" source="button-group">
            <ButtonGroup><Button variant="outline">Back</Button><ButtonGroupSeparator /><ButtonGroupText>Page 2 of 4</ButtonGroupText><ButtonGroupSeparator /><Button variant="outline">Next</Button></ButtonGroup>
          </ComponentCard>
          <ComponentCard name="Calendar" source="calendar" className="items-start">
            <Calendar mode="single" selected={calendarDate} onSelect={setCalendarDate} className="rounded-lg border" />
          </ComponentCard>
          <ComponentCard name="Carousel" source="carousel">
            <Carousel opts={{ align: "start" }} className="w-full max-w-xs"><CarouselContent>{["Tokens", "Layers", "Routes"].map((label) => <CarouselItem key={label} className="basis-2/3"><div className="rounded-lg border bg-muted p-5 text-center text-sm font-medium">{label}</div></CarouselItem>)}</CarouselContent><CarouselPrevious /><CarouselNext /></Carousel>
          </ComponentCard>
          <ComponentCard name="Chart" source="chart">
            <ChartContainer config={chartConfig} className="min-h-32 w-full"><BarChart accessibilityLayer data={chartData}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} /><ChartTooltip content={<ChartTooltipContent hideLabel />} /><Bar dataKey="views" fill="var(--color-views)" radius={4} /></BarChart></ChartContainer>
          </ComponentCard>
          <ComponentCard name="Combobox" source="combobox">
            <Combobox items={comboItems} defaultValue="React"><ComboboxInput placeholder="Choose a library" /><ComboboxContent><ComboboxList><ComboboxEmpty>No library found.</ComboboxEmpty>{comboItems.map((item) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>)}</ComboboxList></ComboboxContent></Combobox>
          </ComponentCard>
          <ComponentCard name="Message" source="message" className="items-stretch">
            <MessageGroup className="w-full max-w-sm"><Message><MessageAvatar><Avatar className="size-7"><AvatarFallback>MC</AvatarFallback></Avatar></MessageAvatar><MessageContent><MessageHeader>Mara · just now</MessageHeader><div className="rounded-lg bg-muted px-3 py-2 text-sm">The new gallery is ready to inspect.</div><MessageFooter>Delivered</MessageFooter></MessageContent></Message></MessageGroup>
          </ComponentCard>
          <ComponentCard name="Message Scroller" source="message-scroller" className="items-stretch">
            <MessageScrollerProvider defaultScrollPosition="end"><MessageScroller className="h-36 w-full max-w-sm rounded-lg border bg-background"><MessageScrollerViewport aria-label="Conversation"><MessageScrollerContent className="p-3"><MessageScrollerItem messageId="one"><div className="rounded-lg bg-muted p-2 text-xs">Earlier message</div></MessageScrollerItem><MessageScrollerItem messageId="two"><div className="rounded-lg bg-primary p-2 text-xs text-primary-foreground">Latest message</div></MessageScrollerItem></MessageScrollerContent></MessageScrollerViewport></MessageScroller></MessageScrollerProvider>
          </ComponentCard>
          <ComponentCard name="Resizable" source="resizable" className="items-stretch">
            <ResizablePanelGroup orientation="horizontal" className="min-h-32 w-full max-w-sm rounded-lg border"><ResizablePanel defaultSize={45} className="p-3 text-xs text-muted-foreground">Source</ResizablePanel><ResizableHandle withHandle /><ResizablePanel defaultSize={55} className="p-3 text-xs text-muted-foreground">Preview</ResizablePanel></ResizablePanelGroup>
          </ComponentCard>
          <ComponentCard name="Scroll Area" source="scroll-area">
            <ScrollArea className="h-28 w-full max-w-xs rounded-lg border p-3"><div className="space-y-3 text-xs text-muted-foreground">{["Spacing", "Typography", "Color", "Border", "Layout", "Components"].map((item) => <p key={item}>{item} tokens and properties</p>)}</div></ScrollArea>
          </ComponentCard>
          <ComponentCard name="Sidebar" source="sidebar" className="items-stretch p-2">
            <SidebarProvider defaultOpen className="min-h-52 rounded-lg border"><Sidebar collapsible="none" className="w-44 border-r"><SidebarContent><SidebarGroup><SidebarGroupLabel>Workspace</SidebarGroupLabel><SidebarMenu><SidebarMenuItem><SidebarMenuButton isActive><SparklesIcon /> Overview</SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton><SettingsIcon /> Settings</SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup></SidebarContent></Sidebar></SidebarProvider>
          </ComponentCard>
          <ComponentCard name="Table" source="table" className="items-stretch">
            <Table><TableHeader><TableRow><TableHead>Component</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Button</TableCell><TableCell><Badge variant="secondary">Ready</Badge></TableCell></TableRow><TableRow><TableCell>Calendar</TableCell><TableCell><Badge variant="outline">Review</Badge></TableCell></TableRow></TableBody></Table>
          </ComponentCard>
          <ComponentCard name="Sonner" source="sonner">
            <div className="flex items-center gap-3"><Button variant="outline" onClick={() => undefined}>Show toast</Button><Toaster /></div>
          </ComponentCard>
          <ComponentCard name="Item" source="item">
            <Item variant="outline" className="w-full max-w-sm"><ItemMedia variant="icon"><FileTextIcon /></ItemMedia><ItemContent><ItemTitle>Design tokens</ItemTitle><ItemDescription>Local component source</ItemDescription></ItemContent><ItemActions><Button size="sm" variant="ghost">Open</Button></ItemActions></Item>
          </ComponentCard>
        </GallerySection>

        <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-8 text-xs text-muted-foreground lg:px-10">
          <span>shadcn/ui registry fixture</span>
          <span className="font-mono">/components · inspect the source, not a screenshot</span>
        </footer>
      </main>
    </TooltipProvider>
  );
}
