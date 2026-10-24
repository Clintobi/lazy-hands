export type SampleId = "bunny" | "sintel";

export type SampleFilm = {
  id: SampleId;
  title: string;
  reel: string;
  durationLabel: string;
  src: string;
  captions: string;
  introEnd: number;
  credit: string;
  license: string;
  licenseUrl: string;
  note: string;
};

export const samples: SampleFilm[] = [
  {
    id: "bunny",
    title: "Big Buck Bunny",
    reel: "Peach trailer",
    durationLabel: "33s",
    src: "/samples/bunny/clip.mp4",
    captions: "/samples/bunny/captions.vtt",
    introEnd: 4.2,
    credit: "(c) copyright Blender Foundation | www.bigbuckbunny.org",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    note: "Official 480p trailer, re-encoded to H.264 for the browser. Attribution required.",
  },
  {
    id: "sintel",
    title: "Sintel",
    reel: "Durian trailer",
    durationLabel: "52s",
    src: "/samples/sintel/clip.mp4",
    captions: "/samples/sintel/captions.vtt",
    introEnd: 8,
    credit: "(c) copyright Blender Foundation | www.sintel.org",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    note: "Official 480p trailer, re-encoded to H.264 for the browser. Attribution required.",
  },
];

export function sampleById(id: string | null | undefined): SampleFilm | undefined {
  return samples.find((s) => s.id === id);
}
