import { test } from "node:test";
import assert from "node:assert/strict";
import { persistGeneratedScheduleWithRpc } from "./schedule-blocks-repository.ts";
import type { DraftScheduleBlock } from "./scheduler.ts";

test("persistGeneratedSchedule delegates atomic replacement through an injected RPC caller", async () => {
  const block: DraftScheduleBlock = {
    sourceType: "task",
    sourceId: "task-1",
    title: "Write proposal",
    responsibilityArea: "echo",
    startTime: "2026-08-02T14:00:00Z",
    endTime: "2026-08-02T15:00:00Z",
    status: "scheduled",
    orderIndex: 0,
  };
  let calledFunction = "";
  let calledParameters: Record<string, unknown> = {};

  const result = await persistGeneratedScheduleWithRpc(
    "plan-1",
    "2026-08-02T13:55:00Z",
    [block],
    async (functionName, parameters) => {
      calledFunction = functionName;
      calledParameters = parameters;
      return {
        data: {
          day_plan: {
            id: "plan-1",
            user_id: "sebastian",
            plan_date: "2026-08-02",
            available_from: "2026-08-02T14:00:00Z",
            energy: 6,
            stress: 4,
            sleep_quality: "good",
            has_eaten: true,
            check_in_notes: null,
            check_in_completed_at: "2026-08-02T13:55:00Z",
            end_of_work_time: "2026-08-03T01:00:00Z",
            status: "generated",
            created_at: "2026-08-02T13:55:00Z",
            updated_at: "2026-08-02T14:00:00Z",
          },
          schedule_blocks: [
            {
              id: "block-1",
              day_plan_id: "plan-1",
              source_type: block.sourceType,
              source_id: block.sourceId,
              title: block.title,
              responsibility_area: block.responsibilityArea,
              start_time: block.startTime,
              end_time: block.endTime,
              status: block.status,
              order_index: block.orderIndex,
              created_at: "2026-08-02T14:00:00Z",
              updated_at: "2026-08-02T14:00:00Z",
            },
          ],
        },
        error: null,
      };
    },
  );

  assert.equal(calledFunction, "replace_day_plan_schedule");
  assert.equal(calledParameters.p_user_id, "sebastian");
  assert.equal(calledParameters.p_day_plan_id, "plan-1");
  assert.deepEqual(calledParameters.p_blocks, [
    {
      source_type: block.sourceType,
      source_id: block.sourceId,
      title: block.title,
      responsibility_area: block.responsibilityArea,
      start_time: block.startTime,
      end_time: block.endTime,
      status: block.status,
      order_index: block.orderIndex,
    },
  ]);
  assert.equal(result.dayPlan.status, "generated");
  assert.equal(result.scheduleBlocks[0]?.id, "block-1");
});
