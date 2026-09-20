import { Avatar, AvatarFallback, AvatarImage } from "#components/core/avatar";

export function AvatarShowcase() {
  return (
    <section className="py-4 space-y-8">
      <h2 className="text-2xl font-semibold">Avatar</h2>
      <div className="flex items-center gap-4">
        <Avatar>
          <AvatarImage
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%2399434b'/%3E%3Ctext x='40' y='52' text-anchor='middle' font-family='sans-serif' font-size='36' fill='white'%3EH%3C/text%3E%3C/svg%3E"
            alt="Holly"
          />
          <AvatarFallback>WM</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>WM</AvatarFallback>
        </Avatar>
      </div>
    </section>
  );
}
