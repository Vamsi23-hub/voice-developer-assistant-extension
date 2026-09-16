import { describe, expect, it } from "vitest";
import {
  encodeVoiceMessage,
  matchesVoiceSession,
  parseVoiceMessage,
  userFacingVoiceError,
} from "../src/speech/pttProtocol";

describe("voice protocol", () => {
  it("parses inbound start/stop/cancel", () => {
    expect(parseVoiceMessage('{"type":"start"}')).toEqual({ type: "start" });
    expect(parseVoiceMessage('{"type":"stop"}')).toEqual({ type: "stop" });
    expect(parseVoiceMessage('{"type":"cancel"}')).toEqual({ type: "cancel" });
  });

  it("parses inbound commands with a session id", () => {
    expect(parseVoiceMessage('{"type":"start","id":"3"}')).toEqual({
      type: "start",
      id: "3",
    });
    expect(parseVoiceMessage('{"type":"stop","id":"3"}')).toEqual({
      type: "stop",
      id: "3",
    });
    expect(parseVoiceMessage('{"type":"cancel","id":"3"}')).toEqual({
      type: "cancel",
      id: "3",
    });
  });

  it("parses ready, recording, and final transcript", () => {
    expect(parseVoiceMessage('{"type":"ready"}')).toEqual({ type: "ready" });
    expect(parseVoiceMessage('{"type":"recording"}')).toEqual({
      type: "recording",
    });
    expect(
      parseVoiceMessage('{"type":"final","text":"open terminal"}')
    ).toEqual({ type: "final", text: "open terminal" });
  });

  it("parses recording, final, and error with a session id", () => {
    expect(parseVoiceMessage('{"type":"recording","id":"2"}')).toEqual({
      type: "recording",
      id: "2",
    });
    expect(
      parseVoiceMessage('{"type":"final","text":"git status","id":"2"}')
    ).toEqual({ type: "final", text: "git status", id: "2" });
    expect(
      parseVoiceMessage(
        '{"type":"error","code":"STT_FAILED","message":"failed","id":"2"}'
      )
    ).toEqual({
      type: "error",
      code: "STT_FAILED",
      message: "failed",
      id: "2",
    });
  });

  it("parses an error protocol result", () => {
    expect(
      parseVoiceMessage(
        '{"type":"error","code":"MIC_ALREADY_ACTIVE","message":"busy"}'
      )
    ).toEqual({
      type: "error",
      code: "MIC_ALREADY_ACTIVE",
      message: "busy",
    });
  });

  it("rejects an unknown error code", () => {
    expect(() =>
      parseVoiceMessage('{"type":"error","code":"BOOM","message":"no"}')
    ).toThrow(/missing a valid type/);
  });

  it("encodes outbound messages without extra fields", () => {
    expect(encodeVoiceMessage({ type: "ready" })).toBe('{"type":"ready"}');
    expect(
      encodeVoiceMessage({ type: "final", text: "open terminal" })
    ).toBe('{"type":"final","text":"open terminal"}');
    expect(
      encodeVoiceMessage({ type: "final", text: "git status", id: "4" })
    ).toBe('{"type":"final","text":"git status","id":"4"}');
  });

  it("matches messages from the same session and ignores others", () => {
    expect(matchesVoiceSession({ type: "ready" }, "1")).toBe(true);
    expect(matchesVoiceSession({ type: "recording" }, "1")).toBe(true);
    expect(matchesVoiceSession({ type: "recording", id: "1" }, "1")).toBe(
      true
    );
    expect(matchesVoiceSession({ type: "final", text: "x", id: "1" }, "1")).toBe(
      true
    );
    expect(matchesVoiceSession({ type: "final", text: "x", id: "2" }, "1")).toBe(
      false
    );
    expect(
      matchesVoiceSession(
        {
          type: "error",
          code: "STT_FAILED",
          message: "failed",
          id: "9",
        },
        "1"
      )
    ).toBe(false);
  });

  it("maps permission errors to a user-facing editor-agnostic message", () => {
    expect(userFacingVoiceError("MIC_PERMISSION_DENIED")).toMatch(
      /Privacy & Security → Microphone/
    );
    expect(userFacingVoiceError("MIC_PERMISSION_DENIED")).not.toMatch(
      /Cursor|Visual Studio Code/
    );
  });
});
