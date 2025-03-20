import * as CSV from 'csv-string';
import { readFile, writeFile } from 'fs/promises';

const DATA_SOURCE =
  'https://raw.githubusercontent.com/utdata/rwd-billboard-data/refs/heads/main/data-out/hot-100-current.csv';

interface SongWeek {
  chartWeek: Date;
  currentWeek: number;
  title: string;
  performer: string;
  lastWeek: number | undefined;
  peakPos: number;
  weeksOnChart: number;
}

// Read dataset
let hot100: string | undefined = undefined;
try {
  hot100 = await readFile('./hot-100-current.csv', 'utf8');
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw err;
  }
}
if (!hot100) {
  // fetch from source
  console.log('Fetching data from source...');
  const response = await fetch(DATA_SOURCE);
  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.statusText}`);
  }
  hot100 = await response.text();

  // Cache locally
  await writeFile('./hot-100-current.csv', hot100);
}

const rows = CSV.parse(hot100);

// Get headers (not that we care about them)
const headers = rows.shift();
if (!headers) {
  throw new Error('No headers found');
}

// Parse each row into a song
const songWeeks = rows.map((fields) => {
  const sw: SongWeek = {
    chartWeek: new Date(fields[0]!),
    currentWeek: parseInt(fields[1]!, 10),
    title: fields[2]!,
    performer: fields[3]!,
    lastWeek: fields[4] !== undefined ? parseInt(fields[4]!, 10) : undefined,
    peakPos: parseInt(fields[5]!, 10),
    weeksOnChart: parseInt(fields[6]!, 10),
  };
  return sw;
});

// Ensure sort-order
songWeeks.sort((a, b) => {
  if (a.chartWeek < b.chartWeek) {
    return -1;
  }
  if (a.chartWeek > b.chartWeek) {
    return 1;
  }
  return a.currentWeek - b.currentWeek;
});

// Reorganize data ...

// First week a song appears on list
const firstSongWeeks = new Map<string, SongWeek>();

// First week a performer appears on list
const firstPerformerWeeks = new Map<string, SongWeek>();

for (const songWeek of songWeeks) {
  // Ignore empty lines
  if (!songWeek.performer) {
    continue;
  }

  const songWeekKey = `${songWeek.performer}:${songWeek.title}`;
  let firstSongWeek = firstSongWeeks.get(songWeekKey);
  if (
    !firstSongWeek ||
    (firstSongWeek && songWeek.chartWeek < firstSongWeek.chartWeek)
  ) {
    firstSongWeeks.set(songWeekKey, songWeek);
    firstSongWeek = songWeek;
  } else {
    // We've already seen this song
    continue;
  }

  let firstPerformerWeek = firstPerformerWeeks.get(songWeek.performer);
  if (
    !firstPerformerWeek ||
    (firstPerformerWeek && songWeek.chartWeek < firstPerformerWeek.chartWeek)
  ) {
    firstPerformerWeeks.set(songWeek.performer, songWeek);
    firstPerformerWeek = songWeek;
  }

  if (firstPerformerWeek === firstSongWeek) {
    continue;
  }
}

// Count # of years between first appearance and reappearances by performer
const yearsSinceFirstAppearance = new Map<number, number>();
for (const [, songWeek] of firstSongWeeks) {
  const firstPerformerWeek = firstPerformerWeeks.get(songWeek.performer)!;
  if (firstPerformerWeek === songWeek) {
    continue;
  }

  const interval =
    songWeek.chartWeek.getTime() - firstPerformerWeek.chartWeek.getTime();
  const years = Math.floor(interval / (1000 * 60 * 60 * 24 * 365));

  yearsSinceFirstAppearance.set(
    years,
    (yearsSinceFirstAppearance.get(years) || 0) + 1
  );

  // Log outlier cases?
  if (years > 40) {
    console.log(
      `${
        songWeek.performer
      } first appeared in ${firstPerformerWeek.chartWeek.getFullYear()} with "${
        firstPerformerWeek.title
      }", and reappeared in ${songWeek.chartWeek.getFullYear()} with "${
        songWeek.title
      }" (${years} years later)`
    );
  }
}

console.log('# of performers:', firstPerformerWeeks.size);
console.log('# of songs:', firstSongWeeks.size);

console.log();

console.log('Years since first appearance by performer,# of reappearances');
for (const [years, count] of yearsSinceFirstAppearance) {
  console.log(`${years},${count}`);
}
