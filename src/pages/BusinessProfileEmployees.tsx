import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};
const listContainer = {
  show: { transition: { staggerChildren: 0.055 } },
};
const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};

const employeeRanges = [
  "Less than 10",
  "10 - 100",
  "100 - 500",
  "500 - 1,000",
  "1,000 - 2,000",
  "2,000 - 5,000",
  "5,000 - 10,000",
  "More than 10,000",
];

const BusinessProfileEmployees = () => {
  const [selectedRange, setSelectedRange] = useState<string | null>(null);
  const reduced = useReducedMotion();

  return (
    <DashboardLayout>
      <motion.div
        className="space-y-4 pb-20"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={section} className="flex items-center gap-2">
          <Link
            to="/business-profile"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d0d4dc]"
          >
            <ChevronLeft className="h-4 w-4 text-[#6b7280]" />
          </Link>
          <h1 className="text-base font-semibold text-[#363636]">Number of Employees</h1>
        </motion.div>

        <motion.div variants={section} className="rounded-xl bg-[#f0f4ff] px-3 py-2 text-sm text-[#256fef]">
          Please select the number of employees at your company.
        </motion.div>

        <motion.div variants={listContainer} className="overflow-hidden rounded-2xl border border-[#d0d4dc] bg-[#ffffff]">
          {employeeRanges.map((range) => {
            const isSelected = selectedRange === range;

            return (
              <motion.button
                variants={listItem}
                whileTap={TAP}
                transition={TAP_T}
                key={range}
                className="flex w-full items-center gap-3 border-b border-[#d0d4dc] px-4 py-4 text-left last:border-0"
                onClick={() => setSelectedRange(range)}
                type="button"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    isSelected ? "border-[#256fef] bg-[#256fef]" : "border-[#d0d4dc]"
                  }`}
                >
                  {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
                <span className="text-sm text-[#363636]">{range}</span>
              </motion.button>
            );
          })}
        </motion.div>

        <motion.button
          variants={section}
          whileTap={TAP}
          transition={TAP_T}
          className={`w-full rounded-full bg-[#256fef] py-3 text-sm font-semibold text-white ${
            selectedRange ? "" : "cursor-not-allowed opacity-50"
          }`}
          disabled={!selectedRange}
          type="button"
        >
          Save
        </motion.button>
      </motion.div>
    </DashboardLayout>
  );
};

export default BusinessProfileEmployees;
