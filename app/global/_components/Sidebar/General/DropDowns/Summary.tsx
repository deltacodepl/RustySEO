// @ts-nocheck
import React, {
  useMemo,
  memo,
  useCallback,
  useEffect,
  useState,
  useReducer,
} from "react";
import debounce from "lodash.debounce";
import useGlobalCrawlStore from "@/store/GlobalCrawlDataStore";

import { FiChevronDown, FiChevronRight, FiChevronUp } from "react-icons/fi";

interface CrawlDataItem {
  anchor_links?: {
    internal?: { links?: string[] };
    external?: { links?: string[] };
  };
  indexability?: {
    indexability?: number;
  };
}

interface SummaryItem {
  label: string;
  value: number;
  percentage: string;
}

const SummaryItemRow: React.FC<SummaryItem> = memo(
  ({ label, value, percentage }) => (
    <div className="flex items-center text-xs w-full px-2 justify-between border-b dark:border-b-brand-dark">
      <div className="w-2/3 pl-2.5 py-1 text-brand-bright">{label}</div>
      <div className="w-1/6 text-right pr-2">{value}</div>
      <div className="w-1/6 text-right pr-2">{percentage}</div>
    </div>
  ),
);

SummaryItemRow.displayName = "SummaryItemRow";

type State = {
  internalLinks: string[];
  externalLinks: string[];
  totalIndexablePages: number;
  isProcessing: boolean;
};

type Action = {
  type: "UPDATE_DATA";
  payload: CrawlDataItem[];
};

const initialState: State = {
  internalLinks: [],
  externalLinks: [],
  totalIndexablePages: 0,
  isProcessing: false,
};

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "UPDATE_DATA":
      const internalLinksSet = new Set(state.internalLinks);
      const externalLinksSet = new Set(state.externalLinks);
      let totalIndexablePages = 0;

      for (const item of action.payload) {
        item?.anchor_links?.internal?.links?.forEach((link) =>
          internalLinksSet.add(link),
        );
        item?.anchor_links?.external?.links?.forEach((link) =>
          externalLinksSet.add(link),
        );
        if ((item?.indexability?.indexability || 0) > 0.5) {
          totalIndexablePages++;
        }
      }

      return {
        internalLinks: Array.from(internalLinksSet),
        externalLinks: Array.from(externalLinksSet),
        totalIndexablePages,
        isProcessing: false,
      };
    default:
      return state;
  }
};

const Summary: React.FC = () => {
  const { crawlData, setSummary } = useGlobalCrawlStore();
  const [state, dispatch] = useReducer(reducer, initialState);

  const [isOpen, setIsOpen] = useState(false);
  // Memoize crawlData to prevent unnecessary recalculations
  const stableCrawlData = useMemo(() => crawlData || [], [crawlData]);

  // Stable debounced update function
  const debouncedUpdate = useCallback(
    debounce((data: CrawlDataItem[]) => {
      dispatch({ type: "UPDATE_DATA", payload: data });
    }, 300),
    [],
  );

  // Update global summary only when processing is complete
  useEffect(() => {
    if (!state.isProcessing) {
      setSummary({
        totaPagesCrawled: stableCrawlData.length,
        totalInternalLinks: state.internalLinks.length,
        totalExternalLinks: state.externalLinks.length,
        totalLinksFound:
          state.internalLinks.length + state.externalLinks.length,
        notIndexablePages: stableCrawlData.length - state.totalIndexablePages,
        indexablePages: state.totalIndexablePages,
      });
    }
  }, [state, stableCrawlData, setSummary]);

  // Trigger debounced update when crawlData changes
  useEffect(() => {
    debouncedUpdate(stableCrawlData);
    return () => debouncedUpdate.cancel();
  }, [stableCrawlData, debouncedUpdate]);

  // Memoize derived values
  const { totalPagesCrawled, totalNotIndexablePages } = useMemo(
    () => ({
      totalPagesCrawled: stableCrawlData.length,
      totalNotIndexablePages:
        stableCrawlData.length - state.totalIndexablePages,
    }),
    [stableCrawlData, state.totalIndexablePages],
  );

  // Memoize summary data
  const summaryData: SummaryItem[] = useMemo(
    () => [
      {
        label: "Pages crawled",
        value: totalPagesCrawled,
        percentage: "100%",
      },
      {
        label: "Total Links Found",
        value: state.internalLinks.length + state.externalLinks.length,
        percentage: "100%",
      },
      {
        label: "Total Internal Links",
        value: state.internalLinks.length,
        percentage:
          state.internalLinks.length + state.externalLinks.length
            ? `${((state.internalLinks.length / (state.internalLinks.length + state.externalLinks.length)) * 100).toFixed(0)}%`
            : "0%",
      },
      {
        label: "Total External Links",
        value: state.externalLinks.length,
        percentage:
          state.internalLinks.length + state.externalLinks.length
            ? `${((state.externalLinks.length / (state.internalLinks.length + state.externalLinks.length)) * 100).toFixed(0)}%`
            : "0%",
      },
      {
        label: "Total Indexable Pages",
        value: state.totalIndexablePages,
        percentage: totalPagesCrawled
          ? `${((state.totalIndexablePages / totalPagesCrawled) * 100).toFixed(0)}%`
          : "0%",
      },
      {
        label: "Total Not Indexable Pages",
        value: totalNotIndexablePages,
        percentage: totalPagesCrawled
          ? `${((totalNotIndexablePages / totalPagesCrawled) * 100).toFixed(0)}%`
          : "0%",
      },
    ],
    [state, totalPagesCrawled, totalNotIndexablePages],
  );

  return (
    <div className="text-xs w-full">
      <div className="w-full cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="text-xs font-semibold border-b dark:border-b-brand-dark pl-1 pb-1.5 flex items-center">
          <span className="">
            {isOpen ? (
              <FiChevronDown size={14} />
            ) : (
              <FiChevronRight size={14} />
            )}
          </span>
          <span className="ml-1">Summary</span>
          {state.isProcessing && (
            <span className="ml-2 text-xs text-gray-500">Processing...</span>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="w-full">
          {summaryData.map((item, index) => (
            <SummaryItemRow key={index} {...item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default memo(Summary);
