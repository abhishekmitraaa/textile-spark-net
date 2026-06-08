import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

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

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-20">
        <div className="flex items-center gap-2">
          <Link
            to="/business-profile"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d0d4dc]"
          >
            <ChevronLeft className="h-4 w-4 text-[#6b7280]" />
          </Link>
          <h1 className="text-base font-semibold text-[#363636]">Number of Employees</h1>
        </div>

        <div className="rounded-xl bg-[#f0f4ff] px-3 py-2 text-sm text-[#256fef]">
          Please select the number of employees at your company.
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#d0d4dc] bg-[#ffffff]">
          {employeeRanges.map((range) => {
            const isSelected = selectedRange === range;

            return (
              <button
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
              </button>
            );
          })}
        </div>

        <button
          className={`w-full rounded-full bg-[#256fef] py-3 text-sm font-semibold text-white ${
            selectedRange ? "" : "cursor-not-allowed opacity-50"
          }`}
          disabled={!selectedRange}
          type="button"
        >
          Save
        </button>
      </div>
    </DashboardLayout>
  );
};

export default BusinessProfileEmployees;
