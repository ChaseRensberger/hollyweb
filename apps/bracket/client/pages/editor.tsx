import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  PlusIcon,
  ShuffleIcon,
  TrashIcon,
  ImageIcon,
  ListPlusIcon,
  ArrowRightIcon,
} from "@phosphor-icons/react";
import { Button } from "@hollyweb/core/components/core/button";
import { Input } from "@hollyweb/core/components/core/input";
import { Textarea } from "@hollyweb/core/components/core/textarea";
import { Label } from "@hollyweb/core/components/core/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@hollyweb/core/components/core/dialog";
import { bracketInput, shuffle, type Entrant } from "../../shared/bracket";
import { api, meOptions, templateOptions, type Template, type Bracket } from "../api";
import { EntrantArt, ErrorNotice, Loading, PageHeading, SignInPrompt } from "../components";

const blank = (): Entrant => ({ id: crypto.randomUUID(), name: "", image: null });

export function Editor() {
  const { id } = useParams({ strict: false });
  const me = useQuery(meOptions);
  const template = useQuery({
    ...templateOptions(id ?? ""),
    enabled: Boolean(id && me.data?.user),
  });
  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorNotice error={me.error} />;
  if (!me.data?.user) return <SignInPrompt />;
  if (id && template.isPending) return <Loading />;
  if (template.error) return <ErrorNotice error={template.error} />;
  return <BracketEditor key={id ?? "new"} template={template.data} />;
}

function BracketEditor({ template }: { template?: Template }) {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [entrants, setEntrants] = useState<Entrant[]>(
    template?.version.entrants ?? Array.from({ length: 8 }, blank),
  );
  const [error, setError] = useState<Error | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState("");
  const [count, setCount] = useState(String(entrants.length));
  const [resizeTo, setResizeTo] = useState<number | null>(null);
  const form = useForm({
    defaultValues: {
      title: template?.version.title ?? "",
      description: template?.version.description ?? "",
    },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = bracketInput.safeParse({ ...value, entrants });
      if (!parsed.success) {
        setError(new Error(parsed.error.issues[0]?.message ?? "Check the bracket details."));
        return;
      }
      try {
        const bracket = template
          ? await api<Bracket>(`/api/brackets/${template.bracket.id}`, {
              method: "PUT",
              body: JSON.stringify({
                input: parsed.data,
                expectedVersion: template.bracket.latestVersion,
              }),
            })
          : await api<Bracket>("/api/brackets", {
              method: "POST",
              body: JSON.stringify(parsed.data),
            });
        await cache.invalidateQueries({ queryKey: ["dashboard"] });
        await cache.invalidateQueries({ queryKey: ["shared", bracket.shareID] });
        await cache.invalidateQueries({ queryKey: ["template", bracket.id] });
        await navigate({ to: "/b/$shareID", params: { shareID: bracket.shareID } });
      } catch (error) {
        setError(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
  function update(id: string, values: Partial<Entrant>) {
    setEntrants((all) => all.map((entry) => (entry.id === id ? { ...entry, ...values } : entry)));
  }
  function move(index: number, direction: number) {
    setEntrants((all) => {
      const next = [...all];
      [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
      return next;
    });
  }
  function resize(size: number) {
    setError(null);
    setEntrants((all) =>
      all.length > size
        ? all.slice(0, size)
        : [...all, ...Array.from({ length: size - all.length }, blank)],
    );
    setCount(String(size));
    setResizeTo(null);
  }
  async function upload(id: string, file?: File) {
    if (!file) return;
    setUploading(id);
    setError(null);
    try {
      const body = new FormData();
      body.set("image", file);
      const { path } = await api<{ path: string }>("/api/uploads", { method: "POST", body });
      update(id, { image: path });
    } catch (error) {
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setUploading(null);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={template ? `Version ${template.version.number}` : "Bracket"}
        title={template ? "Edit bracket" : "New bracket"}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="editor-layout"
      >
        <div className="space-y-7">
          <section className="editor-section">
            <p className="holly-section-label mb-6">Details</p>
            <form.Field name="title">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="bracket-title">Bracket title</Label>
                  <Input
                    id="bracket-title"
                    required
                    maxLength={120}
                    placeholder="Bracket title"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="description">
              {(field) => (
                <div className="mt-5 space-y-2">
                  <Label htmlFor="bracket-description">
                    Description{" "}
                    <span className="font-normal text-muted-foreground">— optional</span>
                  </Label>
                  <Textarea
                    id="bracket-description"
                    maxLength={1000}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
          </section>
          <section className="editor-section">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <p className="holly-section-label">Entrants</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                  <ListPlusIcon /> Add a list
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEntrants(shuffle(entrants))}
                >
                  <ShuffleIcon /> Shuffle
                </Button>
              </div>
            </div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Label htmlFor="seed-count">Number of seeds</Label>
              <Input
                id="seed-count"
                type="number"
                min={8}
                max={64}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="w-20"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const size = Number(count);
                  if (!Number.isInteger(size) || size < 8 || size > 64) {
                    setError(new Error("Choose a whole number from 8 to 64."));
                    return;
                  }
                  if (
                    size < entrants.length &&
                    entrants.slice(size).some((entry) => entry.name || entry.image)
                  )
                    setResizeTo(size);
                  else resize(size);
                }}
              >
                Set size
              </Button>
            </div>
            <div className="space-y-2">
              {entrants.map((entry, index) => (
                <div className="entrant-row" key={entry.id}>
                  <span className="seed-number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="relative">
                    <label
                      className="image-upload"
                      title={entry.image ? "Replace image" : "Add image"}
                    >
                      {entry.image ? <EntrantArt entry={entry} /> : <ImageIcon size={19} />}
                      <input
                        aria-label={`Image for seed ${index + 1}`}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={uploading !== null}
                        onChange={(e) => void upload(entry.id, e.target.files?.[0])}
                      />
                      {uploading === entry.id && (
                        <span className="absolute inset-0 grid place-items-center bg-card/90 text-xs">
                          …
                        </span>
                      )}
                    </label>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label={`Seed ${index + 1} name`}
                      required
                      maxLength={100}
                      placeholder={`Entrant ${index + 1}`}
                      value={entry.name}
                      onChange={(e) => update(entry.id, { name: e.target.value })}
                    />
                    {entry.image && (
                      <button
                        type="button"
                        className="mt-1 text-xs text-muted-foreground hover:text-primary"
                        onClick={() => update(entry.id, { image: null })}
                      >
                        Remove image
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      className="reorder-button"
                      aria-label={`Move seed ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUpIcon />
                    </button>
                    <button
                      type="button"
                      className="reorder-button"
                      aria-label={`Move seed ${index + 1} down`}
                      disabled={index === entrants.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDownIcon />
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove seed ${index + 1}`}
                    disabled={entrants.length <= 8}
                    onClick={() => {
                      setEntrants(entrants.filter((item) => item.id !== entry.id));
                      setCount(String(entrants.length - 1));
                    }}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full border-dashed"
              disabled={entrants.length >= 64}
              onClick={() => {
                setEntrants([...entrants, blank()]);
                setCount(String(entrants.length + 1));
              }}
            >
              <PlusIcon /> Add entrant
            </Button>
          </section>
        </div>
        <aside className="editor-summary">
          <p className="holly-section-label">Summary</p>
          <div className="my-6 grid grid-cols-2 gap-4">
            <div>
              <strong>{entrants.length}</strong>
              <span>entrants</span>
            </div>
            <div>
              <strong>{Math.ceil(Math.log2(entrants.length))}</strong>
              <span>rounds</span>
            </div>
          </div>
          <div className="space-y-4 border-t pt-5 text-sm text-muted-foreground">
            <p>Top seeds receive first-round byes.</p>
            {template && <p>Existing runs keep their original version.</p>}
          </div>
          {error && <ErrorNotice error={error} />}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <Button
                type="submit"
                className="mt-7 w-full"
                disabled={submitting || uploading !== null}
              >
                {submitting ? "Saving…" : template ? "Save new version" : "Create bracket"}
                <ArrowRightIcon />
              </Button>
            )}
          </form.Subscribe>
          <p className="mt-3 text-center text-xs text-muted-foreground">Shared by link.</p>
        </aside>
      </form>
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogTitle>Add entrants</DialogTitle>
          <DialogDescription>
            Paste 8–64 names, one per line. Replaces the current entrants.
          </DialogDescription>
          <Textarea
            aria-label="Entrant names, one per line"
            className="min-h-56"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={"Pizza\nRamen\nTacos\nBurgers\n…"}
          />
          <Button
            onClick={() => {
              const names = bulk
                .split("\n")
                .map((name) => name.trim())
                .filter(Boolean);
              if (
                names.length < 8 ||
                names.length > 64 ||
                names.some((name) => name.length > 100)
              ) {
                setError(new Error("Paste 8–64 names, each under 100 characters."));
                setBulkOpen(false);
                return;
              }
              setError(null);
              setEntrants(names.map((name) => ({ ...blank(), name })));
              setCount(String(names.length));
              setBulkOpen(false);
            }}
          >
            Replace entrants
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={resizeTo !== null}
        onOpenChange={(open) => {
          if (!open) setResizeTo(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            Remove the last {entrants.length - (resizeTo ?? entrants.length)} entrants?
          </DialogTitle>
          <DialogDescription>
            The new size removes names and images after seed {resizeTo}.
          </DialogDescription>
          <Button variant="destructive" onClick={() => resizeTo !== null && resize(resizeTo)}>
            Resize bracket
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
