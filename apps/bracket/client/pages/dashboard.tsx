import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  PlusIcon,
  PencilSimpleIcon,
  ShareNetworkIcon,
  TrashIcon,
  ArrowRightIcon,
  TrophyIcon,
  LinkIcon,
  LockSimpleIcon,
} from "@phosphor-icons/react";
import { Button } from "@hollyweb/core/components/core/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@hollyweb/core/components/core/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@hollyweb/core/components/core/tabs";
import { Input } from "@hollyweb/core/components/core/input";
import { api, dashboardOptions, meOptions, type Template } from "../api";
import {
  EmptyState,
  EntrantArt,
  ErrorNotice,
  Loading,
  PageHeading,
  SignInPrompt,
} from "../components";
import { tournament } from "../../shared/bracket";

export function Dashboard() {
  const me = useQuery(meOptions);
  const query = useQuery({ ...dashboardOptions, enabled: Boolean(me.data?.user) });
  const cache = useQueryClient();
  const [deleting, setDeleting] = useState<{
    id: string;
    title: string;
    kind: "brackets" | "runs";
  } | null>(null);
  const [sharing, setSharing] = useState<Template | null>(null);
  const [copied, setCopied] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/api/${deleting!.kind}/${deleting!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      void cache.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const toggleSharing = useMutation({
    mutationFn: (template: Template) =>
      api<{ sharing: boolean }>(`/api/brackets/${template.bracket.id}/sharing`, {
        method: "PATCH",
        body: JSON.stringify({ sharing: !template.bracket.sharing }),
      }),
    onSuccess: (result) => {
      setSharing(
        (current) =>
          current && { ...current, bracket: { ...current.bracket, sharing: result.sharing } },
      );
      void cache.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorNotice error={me.error} retry={() => void me.refetch()} />;
  if (!me.data?.user) return <SignInPrompt />;
  return (
    <>
      <PageHeading eyebrow="Bracket" title="My collection">
        <Button nativeButton={false} render={<Link to="/new" />}>
          <PlusIcon /> New bracket
        </Button>
      </PageHeading>
      <Tabs defaultValue="brackets">
        <TabsList className="mb-7">
          <TabsTrigger value="brackets">
            My brackets{" "}
            <span className="ml-2 text-xs opacity-60">{query.data?.brackets.length ?? 0}</span>
          </TabsTrigger>
          <TabsTrigger value="runs">
            My picks <span className="ml-2 text-xs opacity-60">{query.data?.runs.length ?? 0}</span>
          </TabsTrigger>
        </TabsList>
        {query.isPending && <Loading />}
        {query.error && <ErrorNotice error={query.error} retry={() => void query.refetch()} />}
        <TabsContent value="brackets">
          <div className="collection-grid">
            {query.data?.brackets.map((template) => (
              <article className="bracket-card" key={template.bracket.id}>
                <Link
                  to="/b/$shareID"
                  params={{ shareID: template.bracket.shareID }}
                  className="block"
                >
                  <div className="card-mosaic">
                    {template.version.entrants.slice(0, 4).map((entry) => (
                      <EntrantArt key={entry.id} entry={entry} />
                    ))}
                  </div>
                  <div className="p-5">
                    <p className="holly-section-label">
                      {template.version.entrants.length} entrants <span className="px-2">/</span> v
                      {template.version.number}
                    </p>
                    <h2 className="mt-3 text-xl font-medium">{template.version.title}</h2>
                    {template.version.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {template.version.description}
                      </p>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-1 border-t px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link to="/edit/$id" params={{ id: template.bracket.id }} />}
                  >
                    <PencilSimpleIcon /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSharing(template);
                      setCopied(false);
                    }}
                  >
                    <ShareNetworkIcon /> Share
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label={`Delete ${template.version.title}`}
                    onClick={() =>
                      setDeleting({
                        id: template.bracket.id,
                        title: template.version.title,
                        kind: "brackets",
                      })
                    }
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {query.data?.brackets.length === 0 && (
            <EmptyState title="No brackets">
              <Button nativeButton={false} className="mt-5" render={<Link to="/new" />}>
                <PlusIcon /> New bracket
              </Button>
            </EmptyState>
          )}
        </TabsContent>
        <TabsContent value="runs">
          <div className="space-y-3">
            {query.data?.runs.map(({ run, version }) => {
              const tree = tournament(version.entrants, run.picks);
              return (
                <article
                  key={run.id}
                  className="flex flex-wrap items-center gap-4 rounded-md border bg-card p-5"
                >
                  <div className="flex size-12 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <TrophyIcon size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link to="/run/$id" params={{ id: run.id }} className="text-lg font-medium">
                      {version.title}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tree.winner
                        ? `Winner: ${tree.winner.name}`
                        : `${tree.completed} of ${tree.total} matchups picked`}{" "}
                      · Version {version.number}
                    </p>
                  </div>
                  <Button
                    nativeButton={false}
                    variant="outline"
                    render={<Link to="/run/$id" params={{ id: run.id }} />}
                  >
                    {tree.winner ? "Review" : "Continue"}
                    <ArrowRightIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete run of ${version.title}`}
                    onClick={() => setDeleting({ id: run.id, title: version.title, kind: "runs" })}
                  >
                    <TrashIcon />
                  </Button>
                </article>
              );
            })}
          </div>
          {query.data?.runs.length === 0 && (
            <EmptyState title="No saved runs">
              <Button
                variant="outline"
                className="mt-5"
                nativeButton={false}
                render={<Link to="/b/$shareID" params={{ shareID: "comfort-food" }} />}
              >
                Open example <ArrowRightIcon />
              </Button>
            </EmptyState>
          )}
        </TabsContent>
      </Tabs>
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) {
            setDeleting(null);
            remove.reset();
          }
        }}
      >
        <DialogContent>
          <DialogTitle>Delete {deleting?.title}?</DialogTitle>
          <DialogDescription>
            {deleting?.kind === "brackets"
              ? "This removes the bracket, its shared link, and all saved runs of it."
              : "This removes this saved run and its picks."}
          </DialogDescription>
          {remove.error && <ErrorNotice error={remove.error} />}
          <DialogFooter>
            <Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(sharing)}
        onOpenChange={(open) => {
          if (!open) setSharing(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Share bracket</DialogTitle>
          <DialogDescription>Anyone with the link can make their own picks.</DialogDescription>
          <div className="flex gap-2">
            <Input
              aria-label="Share link"
              readOnly
              value={sharing ? `${location.origin}/b/${sharing.bracket.shareID}` : ""}
            />
            <Button
              disabled={!sharing?.bracket.sharing}
              onClick={() => {
                void navigator.clipboard
                  .writeText(`${location.origin}/b/${sharing!.bracket.shareID}`)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              <LinkIcon />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button
            variant="outline"
            disabled={toggleSharing.isPending}
            onClick={() => sharing && toggleSharing.mutate(sharing)}
          >
            {sharing?.bracket.sharing ? (
              <>
                <LockSimpleIcon /> Make link private
              </>
            ) : (
              <>
                <ShareNetworkIcon /> Enable shared link
              </>
            )}
          </Button>
          {!sharing?.bracket.sharing && (
            <p className="text-sm text-muted-foreground">
              Sharing is off. Existing saved runs are still available to their owners.
            </p>
          )}
          {toggleSharing.error && <ErrorNotice error={toggleSharing.error} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
