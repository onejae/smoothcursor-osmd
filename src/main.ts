import {
  GraphicalNote,
  IOSMDOptions,
  Note,
  OpenSheetMusicDisplay,
  TransposeCalculator,
} from "opensheetmusicdisplay";

class MagicCursor {
  cursorElement?: HTMLDivElement;
  static parentElement: HTMLDivElement;
  static Instance: MagicCursor;

  constructor(el: HTMLDivElement) {
    try {
      this.cursorElement = window.document.createElement("div");
      this.cursorElement.id = "test";
      this.cursorElement.style.backgroundColor = "rgba(255, 0, 0, 0.7)";
      this.cursorElement.style.position = "absolute";
      this.cursorElement.style.width = "3px";
      this.cursorElement.style.height = "0px";

      el.firstElementChild?.appendChild(this.cursorElement);
    } catch (e) {
      alert(e);
    }
  }

  static createElementDepedentCursor(el: HTMLDivElement): MagicCursor {
    MagicCursor.parentElement = el;
    MagicCursor.Instance = new MagicCursor(el);

    return MagicCursor.Instance;
  }

  moveTo(x: number, y: number, width?: number, height?: number) {
    if (!this.cursorElement) {
      return;
    }

    this.cursorElement.style.left = x.toString() + "px";
    this.cursorElement.style.top = y.toString() + "px";
    if (width) {
      this.cursorElement.style.width = width.toString() + "px";
    }
    if (height) {
      this.cursorElement.style.height = height.toString() + "px";
    }

    this.cursorElement.style.display = "block";
  }
}

interface CursorSnapshot {
  x: number;
  y: number;
  measureIndex: number;
  notes: Note[];
  time: number;
}

const CURSOR_LEFT_MARGIN = 5;
const CURSOR_WIDTH = 3;

class Locator {
  osmd: SmoothCursorOSMD;
  timeStampOfNextCursor?: number;
  time?: number;
  cursorSnapshotList: CursorSnapshot[];
  bpm: number;

  constructor(osmd: SmoothCursorOSMD) {
    this.osmd = osmd;
    this.bpm = 100;
    this.cursorSnapshotList = this.createCursorSnapshot(osmd);
  }

  private getBPMAtMeasure(_measureIndex: number) {
    return this.bpm;
  }

  public setBpm(_bpm: number) {
    this.bpm = _bpm;

    // refactor needed? 
    this.cursorSnapshotList = this.createCursorSnapshot(this.osmd);
  }

  private createCursorSnapshot(osmd: SmoothCursorOSMD): CursorSnapshot[] {
    osmd.cursor.reset();

    let iterator = osmd.cursor.Iterator;
    const cursorSnapshotList: CursorSnapshot[] = [];

    while (!iterator.EndReached) {
      const voices = iterator.CurrentVoiceEntries;
      const notes: Note[] = [];

      const bpm = this.getBPMAtMeasure(iterator.CurrentMeasureIndex);

      for (let i = 0; i < voices.length; i++) {
        for (let j = 0; j < voices[i].Notes.length; j++) {
          notes.push(voices[i].Notes[j]);
        }
      }

      const [x, y, _w, _h] = this.positionFromCursorElement(
        this.osmd.cursor.cursorElement
      );

      const cursorSnapshot: CursorSnapshot = {
        x: x,
        y: y,
        measureIndex: iterator.CurrentMeasureIndex,
        notes: notes,
        time: (iterator.currentTimeStamp.RealValue * 4 * 1000 * 60) / bpm,
      };

      cursorSnapshotList.push(cursorSnapshot);
      this.osmd.cursor.next();
      iterator = osmd.cursor.Iterator;
    }

    osmd.cursor.reset();
    return cursorSnapshotList;
  }

  private getNextCursorTimeStamp(): number {
    const iterator = this.osmd.cursor.iterator.clone();
    iterator.moveToNext();

    return iterator.currentTimeStamp.RealValue * 4 * 1000;
  }

  private positionFromCursorElement(
    el: HTMLElement
  ): [x: number, y: number, width: number, height: number] {
    return [
      parseInt(el.style.left, 10) + CURSOR_LEFT_MARGIN,
      parseInt(el.style.top, 10),
      CURSOR_WIDTH,
      el.clientHeight,
    ];
  }

  init() {
    this.timeStampOfNextCursor = this.getNextCursorTimeStamp();
    this.time = 0;
  }

  update(time: number): void {
    if (this.timeStampOfNextCursor && this.timeStampOfNextCursor <= time) {
      this.timeStampOfNextCursor = this.getNextCursorTimeStamp();
    }
    this.time = time;
  }

  shouldMoveCursor(time: number): boolean {
    return this.timeStampOfNextCursor
      ? time >= this.timeStampOfNextCursor
      : false;
  }

  getPositionByTime(
    time: number
  ): [x: number, y: number, width: number, height: number] {
    let i = 0;

    const width = CURSOR_WIDTH;
    const height = this.osmd.cursor.cursorElement.height;
    let lastCursorSnapshot = this.cursorSnapshotList[0];

    let x = lastCursorSnapshot.x;
    let y = lastCursorSnapshot.y;

    if (time === 0) time = 1;

    while (i < this.cursorSnapshotList.length) {
      if (this.cursorSnapshotList[i].time >= time) {
        if (i !== this.cursorSnapshotList.length) {
          if (lastCursorSnapshot.y !== this.cursorSnapshotList[i].y) {
            x = this.cursorSnapshotList[i].x;
            y = this.cursorSnapshotList[i].y;
          } else {
            x =
              lastCursorSnapshot.x +
              (this.cursorSnapshotList[i].x - lastCursorSnapshot.x) *
                ((time - lastCursorSnapshot.time) /
                  (this.cursorSnapshotList[i].time - lastCursorSnapshot.time));
            y = lastCursorSnapshot.y;
          }

          return [x, y, width, height];
        }
      }

      lastCursorSnapshot = this.cursorSnapshotList[i];
      i++;
    }

    return [x, y, width, height];
  }
}

interface SmoothOSMDOptions extends IOSMDOptions {
  paintNotesOnCursor: boolean;
}

class SmoothCursorOSMD extends OpenSheetMusicDisplay {
  private slidingCursor?: MagicCursor;
  private locator?: Locator;
  private el: HTMLDivElement;
  private options: SmoothOSMDOptions;

  constructor(el: HTMLDivElement, options: SmoothOSMDOptions) {
    super(el, options);

    this.el = el;
    this.options = options;
  }

  getOptions(): SmoothOSMDOptions {
    return this.options;
  }

  async loadXml(musicXmlData: string) {
    await super.load(musicXmlData);
  }

  initLocator() {
    this.locator = new Locator(this);
    this.locator.init();
  }

  getCurrentCursorMeasure() {
    return this.cursor.VoicesUnderCursor()[0].ParentSourceStaffEntry
      .VerticalContainerParent.ParentMeasure;
  }

  setBpm(bpm: number) {
    this.locator?.setBpm(bpm);
  }

  render() {
    super.render();

    this.slidingCursor = MagicCursor.createElementDepedentCursor(this.el);

    if (this.slidingCursor && this.locator) {
      const [newPositionX, newPositionY, width, height] =
        this.locator.getPositionByTime(0);

      this.slidingCursor.moveTo(newPositionX, newPositionY, width, height);
    }
  }

  private changeNoteColor(notes: Note[], colorString: string) {
    notes.forEach((note) => {
      const graphicalNote = GraphicalNote.FromNote(note, this.rules);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el: HTMLDivElement = (graphicalNote as any).vfnote[0]?.attrs?.el;

      if (el) {
        Object.values(el.getElementsByClassName("vf-notehead")).forEach(
          (head) => {
            Object.values(head.getElementsByTagName("path")).forEach((p) => {
              p.setAttribute("fill", colorString);
              p.setAttribute("stroke", colorString);
            });
          }
        );
      }
    });
  }

  updateCursorPosition(time: number): void {
    if (this.locator && this.slidingCursor) {
      this.locator.update(time);

      if (this.locator.shouldMoveCursor(time)) {
        this.changeNoteColor(this.cursor.NotesUnderCursor(), "black");
        this.cursor.next();

        if (this.options.paintNotesOnCursor) {
          this.changeNoteColor(this.cursor.NotesUnderCursor(), "#faa00f");
        }
      }

      const [newPositionX, newPositionY, width, height] =
        this.locator.getPositionByTime(time);

      this.slidingCursor.moveTo(newPositionX, newPositionY, width, height);
    }
  }

  init(): void {
    if (this.cursor) {
      this.changeNoteColor(this.cursor.NotesUnderCursor(), "black");
      this.cursor.reset();
    }

    this.updateCursorPosition(0);
  }
}

export default { SmoothCursorOSMD, TransposeCalculator };
