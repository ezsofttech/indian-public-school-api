export interface DisclosureView {
  label?: string;
  type?: 'PDF' | 'LINK';
  url?: string | null;
  openInNewTab?: boolean;
}

export interface DisclosureItem {
  srNo?: number | string;
  title: string;
  detail?: string | null;
  view?: DisclosureView | null;
  rowId?: string;
}

export interface DisclosureSection {
  sectionKey: string;
  sectionTitle: string;
  items: DisclosureItem[];
}

