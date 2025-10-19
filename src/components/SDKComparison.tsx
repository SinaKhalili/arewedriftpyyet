import React, { useState, useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/themes/prism.css";
import { ComicText } from "@/components/ui/comic-text";
import { RetroGrid } from "./ui/retro-grid";
import { HyperText } from "./ui/hyper-text";
import Tilt from "react-parallax-tilt";

interface Method {
  name: string;
  kind: string;
  parameters?: Array<{ name: string; type: string }>;
  returns?: string;
  isAsync?: boolean;
  decorators?: string[];
  line?: number;
  startLine?: number;
  endLine?: number;
}

interface Class {
  name: string;
  file: string;
  methods: Method[];
  abstract?: boolean;
  extends?: string;
  implements?: string[];
  line?: number;
  startLine?: number;
  endLine?: number;
}

interface SDKData {
  classes: Class[];
}

interface SDKComparisonProps {
  tsData: SDKData;
  pythonData: SDKData;
}

export default function SDKComparison({
  tsData,
  pythonData,
}: SDKComparisonProps) {
  const [showCommon, setShowCommon] = useState(true);
  const [showTsOnly, setShowTsOnly] = useState(false);
  const [showPythonOnly, setShowPythonOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [hideEmptyClasses, setHideEmptyClasses] = useState(true);
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(
    new Set()
  );
  const [hoveredMethod, setHoveredMethod] = useState<string | null>(null);
  const [expandedCodeSnippets, setExpandedCodeSnippets] = useState<Set<string>>(
    new Set()
  );
  const [codeSnippets, setCodeSnippets] = useState<
    Map<
      string,
      {
        content: string;
        file: string;
        line: number;
        language: string;
      }
    >
  >(new Map());
  const [loadingSnippets, setLoadingSnippets] = useState<Set<string>>(
    new Set()
  );

  const tsColumnRef = useRef<HTMLDivElement>(null);
  const pythonColumnRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Create maps for efficient lookup
  const tsClassesMap = new Map(tsData.classes.map((cls) => [cls.name, cls]));
  const pythonClassesMap = new Map(
    pythonData.classes.map((cls) => [cls.name, cls])
  );

  // Get all unique class names and sort them
  const allClassNames = new Set([
    ...tsData.classes.map((cls) => cls.name),
    ...pythonData.classes.map((cls) => cls.name),
  ]);
  const sortedClassNames = Array.from(allClassNames).sort();

  // Filter classes based on current filters
  const filteredClassNames = sortedClassNames.filter((className) => {
    const tsClass = tsClassesMap.get(className);
    const pythonClass = pythonClassesMap.get(className);

    // Filter out empty classes if hideEmptyClasses is enabled
    if (hideEmptyClasses) {
      const tsMethodCount = tsClass?.methods.length || 0;
      const pythonMethodCount = pythonClass?.methods.length || 0;
      if (tsMethodCount === 0 && pythonMethodCount === 0) {
        return false;
      }
    }

    let matchesToggle = false;
    if (tsClass && pythonClass && showCommon) {
      matchesToggle = true; // Common class
    } else if (tsClass && !pythonClass && showTsOnly) {
      matchesToggle = true; // TypeScript only
    } else if (!tsClass && pythonClass && showPythonOnly) {
      matchesToggle = true; // Python only
    }

    const text = `${className} ${
      tsClass?.methods.map((m) => m.name).join(" ") || ""
    } ${pythonClass?.methods.map((m) => m.name).join(" ") || ""}`.toLowerCase();
    const matchesSearch =
      !searchTerm || text.includes(searchTerm.toLowerCase());

    return matchesToggle && matchesSearch;
  });

  // Synchronized scrolling
  const handleScroll = (
    sourceRef: React.RefObject<HTMLDivElement>,
    targetRef: React.RefObject<HTMLDivElement>
  ) => {
    if (!isScrollingRef.current && sourceRef.current && targetRef.current) {
      isScrollingRef.current = true;
      targetRef.current.scrollTop = sourceRef.current.scrollTop;
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 50);
    }
  };

  // Toggle class expansion
  const toggleClass = (className: string) => {
    setExpandedClasses((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(className)) {
        newSet.delete(className);
      } else {
        newSet.add(className);
      }
      return newSet;
    });
  };

  // Helper function to get clean file path for GitHub URLs
  const getCleanFilePath = (filePath: string, sdkName: string): string => {
    if (sdkName === "ts") {
      // Remove 'protocol-v2/sdk/src/' prefix for TypeScript files
      return filePath.replace(/^protocol-v2\/sdk\/src\//, "");
    } else {
      // Remove 'driftpy/' prefix for Python files
      return filePath.replace(/^driftpy\//, "");
    }
  };

  // Convert snake_case to camelCase for comparison
  const toCamelCase = (str: string): string => {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  };

  // Highlight code using Prism.js
  const highlightCode = (code: string, language: string): string => {
    try {
      if (language === "typescript") {
        return Prism.highlight(code, Prism.languages.typescript, "typescript");
      } else if (language === "python") {
        return Prism.highlight(code, Prism.languages.python, "python");
      }
      return code;
    } catch (error) {
      console.error("Failed to highlight code:", error);
      return code;
    }
  };

  // Fetch code snippet from GitHub API
  const fetchCodeSnippet = async (
    filePath: string,
    startLine: number,
    endLine: number,
    sdkName: string,
    key: string
  ) => {
    setLoadingSnippets((prev) => new Set(prev).add(key));
    try {
      const cleanPath = getCleanFilePath(filePath, sdkName);
      const repo = sdkName === "ts" ? "protocol-v2" : "driftpy";
      const branch = sdkName === "ts" ? "sdk/src" : "src/driftpy";

      const response = await fetch(
        `https://api.github.com/repos/drift-labs/${repo}/contents/${branch}/${cleanPath}`
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();
      const content = atob(data.content);
      const lines = content.split("\n");

      // Use actual start and end lines from AST, convert to 0-based indexing
      const snippetStart = Math.max(0, startLine - 1);
      const snippetEnd = Math.min(lines.length, endLine);
      const snippetLines = lines.slice(snippetStart, snippetEnd);

      setCodeSnippets((prev) =>
        new Map(prev).set(key, {
          content: snippetLines.join("\n"),
          file: cleanPath,
          line: startLine,
          language: sdkName === "ts" ? "typescript" : "python",
        })
      );
    } catch (error) {
      console.error("Failed to fetch code snippet:", error);
    } finally {
      setLoadingSnippets((prev) => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    }
  };

  // Toggle code snippet expansion
  const toggleCodeSnippet = (
    key: string,
    filePath: string,
    startLine: number,
    endLine: number,
    sdkName: string
  ) => {
    const newExpanded = new Set(expandedCodeSnippets);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
      // Fetch code if not already cached
      if (!codeSnippets.has(key)) {
        fetchCodeSnippet(filePath, startLine, endLine, sdkName, key);
      }
    }
    setExpandedCodeSnippets(newExpanded);
  };

  // Get sorted methods for a class, excluding constructors for TypeScript
  const getSortedMethods = (sdkClass: Class, sdkName: string): Method[] => {
    const methods =
      sdkName === "ts"
        ? sdkClass.methods.filter((m) => m.name !== "constructor")
        : sdkClass.methods;

    return methods.sort((a, b) => a.name.localeCompare(b.name));
  };

  // Get normalized method name for comparison (camelCase for Python methods)
  const getNormalizedMethodName = (
    methodName: string,
    sdkName: string
  ): string => {
    return sdkName === "python" ? toCamelCase(methodName) : methodName;
  };

  // Get method comparison status
  const getMethodComparisonStatus = (
    methodName: string,
    tsClass: Class | undefined,
    pythonClass: Class | undefined,
    currentSdkName: string
  ) => {
    if (!tsClass || !pythonClass) {
      return "missing";
    }

    // Filter out constructors from TypeScript methods for comparison
    const tsMethodNames = tsClass.methods
      .filter((m) => m.name !== "constructor")
      .map((m) => m.name);
    const pythonMethodNames = pythonClass.methods.map((m) => m.name);

    // Convert Python snake_case to camelCase for comparison
    const pythonMethodNamesCamelCase = pythonMethodNames.map(toCamelCase);

    // Normalize the current method name based on SDK
    const normalizedCurrentMethod =
      currentSdkName === "python" ? toCamelCase(methodName) : methodName;

    const tsHasMethod = tsMethodNames.includes(normalizedCurrentMethod);
    const pythonHasMethod = pythonMethodNamesCamelCase.includes(
      normalizedCurrentMethod
    );

    if (tsHasMethod && pythonHasMethod) {
      return "both";
    } else if (tsHasMethod && !pythonHasMethod) {
      return "ts-only";
    } else if (!tsHasMethod && pythonHasMethod) {
      return "python-only";
    } else {
      return "missing";
    }
  };

  // Render method comparison icon
  const renderMethodIcon = (
    methodName: string,
    tsClass: Class | undefined,
    pythonClass: Class | undefined,
    sdkName: string
  ) => {
    const status = getMethodComparisonStatus(
      methodName,
      tsClass,
      pythonClass,
      sdkName
    );

    switch (status) {
      case "both":
        return (
          <svg
            className="w-3 h-3 text-green-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "ts-only":
        return (
          <svg
            className="w-3 h-3 text-blue-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "python-only":
        return <span className="text-lg">🐍</span>;
      default:
        return (
          <svg
            className="w-3 h-3 text-gray-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l2-2a1 1 0 00-1.414-1.414L11 7.586V3a1 1 0 10-2 0v4.586l-.293-.293z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  // Get method tooltip
  const getMethodTooltip = (
    methodName: string,
    tsClass: Class | undefined,
    pythonClass: Class | undefined,
    sdkName: string
  ) => {
    const status = getMethodComparisonStatus(
      methodName,
      tsClass,
      pythonClass,
      sdkName
    );

    switch (status) {
      case "both":
        return `Implemented in both SDKs\nTS: ${tsClass?.file}\nPython: ${pythonClass?.file}`;
      case "ts-only":
        return `Only in TypeScript SDK\nFile: ${tsClass?.file}`;
      case "python-only":
        return `Only in Python SDK\nFile: ${pythonClass?.file}`;
      default:
        return `Not found in either SDK`;
    }
  };

  // Get class tooltip with implementation links
  const getClassTooltip = (
    className: string,
    tsClass: Class | undefined,
    pythonClass: Class | undefined
  ) => {
    if (!tsClass || !pythonClass) {
      if (tsClass) {
        return `TypeScript only\nFile: ${tsClass.file}`;
      } else if (pythonClass) {
        return `Python only\nFile: ${pythonClass.file}`;
      }
      return "Missing in both SDKs";
    }

    const tsMethodCount = tsClass.methods.filter(
      (m) => m.name !== "constructor"
    ).length;
    const pythonMethodCount = pythonClass.methods.length;

    if (tsMethodCount === pythonMethodCount) {
      return `Same method count (${tsMethodCount})\nTS: ${tsClass.file}\nPython: ${pythonClass.file}`;
    } else if (tsMethodCount > pythonMethodCount) {
      return `TypeScript has ${
        tsMethodCount - pythonMethodCount
      } more methods\nTS: ${tsClass.file}\nPython: ${pythonClass.file}`;
    } else {
      return `Python has ${
        pythonMethodCount - tsMethodCount
      } more methods\nTS: ${tsClass.file}\nPython: ${pythonClass.file}`;
    }
  };

  // Render a class card
  const renderClassCard = (
    className: string,
    sdkClass: Class | undefined,
    sdkName: string,
    isLeft: boolean
  ) => {
    const isExpanded = expandedClasses.has(className);
    const tsClass = tsClassesMap.get(className);
    const pythonClass = pythonClassesMap.get(className);

    // Determine comparison status
    const getComparisonIcon = () => {
      if (!tsClass || !pythonClass) {
        return (
          <svg
            className="w-4 h-4 text-gray-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l2-2a1 1 0 00-1.414-1.414L11 7.586V3a1 1 0 10-2 0v4.586l-.293-.293z"
              clipRule="evenodd"
            />
          </svg>
        );
      }

      const tsMethodCount = tsClass.methods.filter(
        (m) => m.name !== "constructor"
      ).length;
      const pythonMethodCount = pythonClass.methods.length;

      if (tsMethodCount === pythonMethodCount) {
        return (
          <svg
            className="w-4 h-4 text-green-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        );
      } else if (tsMethodCount > pythonMethodCount) {
        return (
          <svg
            className="w-4 h-4 text-blue-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
        );
      } else {
        return <span className="text-lg">🐍</span>;
      }
    };

    const getComparisonTooltip = () => {
      if (!tsClass || !pythonClass) {
        return "Missing in one SDK";
      }

      const tsMethodCount = tsClass.methods.filter(
        (m) => m.name !== "constructor"
      ).length;
      const pythonMethodCount = pythonClass.methods.length;

      if (tsMethodCount === pythonMethodCount) {
        return `Same method count (${tsMethodCount})`;
      } else if (tsMethodCount > pythonMethodCount) {
        return `TypeScript has ${
          tsMethodCount - pythonMethodCount
        } more methods`;
      } else {
        return `Python has ${pythonMethodCount - tsMethodCount} more methods`;
      }
    };

    if (sdkClass) {
      return (
        <div className="mb-2" key={`${sdkName}-${className}`}>
          <div className="bg-white border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 hover:bg-[#C0C0C0] min-h-[72px] gap-2 sm:gap-0">
              <div className="flex items-center space-x-2 flex-1">
                <h3
                  className="text-sm font-semibold text-black"
                  style={{ fontFamily: "MS Sans Serif, sans-serif" }}
                >
                  {sdkClass.name}
                </h3>
                <div className="flex items-center space-x-1">
                  {getComparisonIcon()}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                <span className="text-xs text-gray-500">
                  {sdkName === "ts"
                    ? `${
                        sdkClass.methods.filter((m) => m.name !== "constructor")
                          .length
                      } methods`
                    : `${sdkClass.methods.length} methods`}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleClass(className);
                  }}
                  className="bg-[#C0C0C0] border border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] px-2 py-1 text-xs text-black hover:bg-[#D0D0D0] active:border-t-[#808080] active:border-l-[#808080] active:border-r-[#FFFFFF] active:border-b-[#FFFFFF]"
                  title="Expand/Collapse class"
                  style={{ fontFamily: "MS Sans Serif, sans-serif" }}
                >
                  {isExpanded ? "Collapse" : "Expand"}
                </button>
                <div className="flex flex-col items-end space-y-1">
                  <div className="flex items-center space-x-2">
                    <a
                      href={`https://github.com/drift-labs/${
                        sdkName === "ts" ? "protocol-v2" : "driftpy"
                      }/tree/master/${
                        sdkName === "ts" ? "sdk/src" : "src/driftpy"
                      }/${getCleanFilePath(sdkClass.file, sdkName)}#L${
                        sdkClass.startLine || sdkClass.line || 1
                      }`}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      title={`Open ${sdkClass.file} at line ${
                        sdkClass.startLine || sdkClass.line || 1
                      }`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {sdkClass.file}
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const key = `${sdkName}-${className}-class`;
                        toggleCodeSnippet(
                          key,
                          sdkClass.file,
                          sdkClass.startLine || sdkClass.line || 1,
                          sdkClass.endLine || sdkClass.line || 1,
                          sdkName
                        );
                      }}
                      className="bg-[#C0C0C0] border border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] px-2 py-1 text-xs text-black hover:bg-[#D0D0D0] active:border-t-[#808080] active:border-l-[#808080] active:border-r-[#FFFFFF] active:border-b-[#FFFFFF]"
                      title="Show code snippet"
                      style={{ fontFamily: "MS Sans Serif, sans-serif" }}
                    >
                      {loadingSnippets.has(`${sdkName}-${className}-class`)
                        ? "..."
                        : "View"}
                    </button>
                  </div>
                  <span className="text-xs text-gray-500">
                    Line {sdkClass.startLine || sdkClass.line || 1}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>

            {/* Code snippet for class */}
            {expandedCodeSnippets.has(`${sdkName}-${className}-class`) && (
              <div className="px-3 pb-3 border-t border-gray-100">
                {loadingSnippets.has(`${sdkName}-${className}-class`) ? (
                  <div className="text-sm text-gray-500 py-2">
                    Loading code snippet...
                  </div>
                ) : codeSnippets.has(`${sdkName}-${className}-class`) ? (
                  <div className="mt-2">
                    <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto border">
                      <code
                        className={`language-${
                          codeSnippets.get(`${sdkName}-${className}-class`)
                            ?.language
                        }`}
                        dangerouslySetInnerHTML={{
                          __html: highlightCode(
                            codeSnippets.get(`${sdkName}-${className}-class`)
                              ?.content || "",
                            codeSnippets.get(`${sdkName}-${className}-class`)
                              ?.language || ""
                          ),
                        }}
                      />
                    </pre>
                  </div>
                ) : null}
              </div>
            )}

            {isExpanded && (
              <div className="px-3 pb-3 space-y-1">
                {getSortedMethods(sdkClass, sdkName).map((method) => {
                  const tsClass = tsClassesMap.get(className);
                  const pythonClass = pythonClassesMap.get(className);
                  const normalizedMethodName = getNormalizedMethodName(
                    method.name,
                    sdkName
                  );
                  const isHovered = hoveredMethod === normalizedMethodName;

                  return (
                    <div key={method.name}>
                      <div
                        className={`flex items-center space-x-2 text-sm px-2 py-1 rounded cursor-pointer transition-colors ${
                          isHovered
                            ? "bg-blue-100 text-blue-800"
                            : "hover:bg-gray-50 text-gray-700"
                        }`}
                        onMouseEnter={() =>
                          setHoveredMethod(normalizedMethodName)
                        }
                        onMouseLeave={() => setHoveredMethod(null)}
                      >
                        <div className="flex items-center space-x-1">
                          {renderMethodIcon(
                            method.name,
                            tsClass,
                            pythonClass,
                            sdkName
                          )}
                        </div>
                        <span className="flex-1">{method.name}</span>
                        <div className="flex flex-col items-end space-y-1">
                          <div className="flex items-center space-x-2">
                            <a
                              href={`https://github.com/drift-labs/${
                                sdkName === "ts" ? "protocol-v2" : "driftpy"
                              }/tree/master/${
                                sdkName === "ts" ? "sdk/src" : "src/driftpy"
                              }/${getCleanFilePath(sdkClass.file, sdkName)}#L${
                                method.startLine || method.line || 1
                              }`}
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                              title={`Open ${sdkClass.file} at line ${
                                method.startLine || method.line || 1
                              }`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {sdkClass.file}
                            </a>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const key = `${sdkName}-${className}-${method.name}`;
                                toggleCodeSnippet(
                                  key,
                                  sdkClass.file,
                                  method.startLine || method.line || 1,
                                  method.endLine || method.line || 1,
                                  sdkName
                                );
                              }}
                              className="bg-[#C0C0C0] border border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] px-2 py-1 text-xs text-black hover:bg-[#D0D0D0] active:border-t-[#808080] active:border-l-[#808080] active:border-r-[#FFFFFF] active:border-b-[#FFFFFF]"
                              title="Show code snippet"
                              style={{
                                fontFamily: "MS Sans Serif, sans-serif",
                              }}
                            >
                              {loadingSnippets.has(
                                `${sdkName}-${className}-${method.name}`
                              )
                                ? "..."
                                : "View"}
                            </button>
                          </div>
                          <span className="text-xs text-gray-500">
                            Line {method.startLine || method.line || 1}
                          </span>
                        </div>
                      </div>

                      {/* Code snippet for method */}
                      {expandedCodeSnippets.has(
                        `${sdkName}-${className}-${method.name}`
                      ) && (
                        <div className="ml-4 mb-2">
                          {loadingSnippets.has(
                            `${sdkName}-${className}-${method.name}`
                          ) ? (
                            <div className="text-sm text-gray-500 py-2">
                              Loading code snippet...
                            </div>
                          ) : codeSnippets.has(
                              `${sdkName}-${className}-${method.name}`
                            ) ? (
                            <div className="mt-1">
                              <pre className="bg-gray-50 p-2 rounded text-xs overflow-x-auto border">
                                <code
                                  className={`language-${
                                    codeSnippets.get(
                                      `${sdkName}-${className}-${method.name}`
                                    )?.language
                                  }`}
                                  dangerouslySetInnerHTML={{
                                    __html: highlightCode(
                                      codeSnippets.get(
                                        `${sdkName}-${className}-${method.name}`
                                      )?.content || "",
                                      codeSnippets.get(
                                        `${sdkName}-${className}-${method.name}`
                                      )?.language || ""
                                    ),
                                  }}
                                />
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Show constructor separately if it exists in TypeScript */}
                {sdkName === "ts" &&
                  sdkClass.methods.some((m) => m.name === "constructor") && (
                    <div className="flex items-center space-x-2 text-sm text-gray-400 italic px-2 py-1 rounded">
                      <div className="flex items-center space-x-1">
                        <svg
                          className="w-3 h-3 text-gray-400"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l2-2a1 1 0 00-1.414-1.414L11 7.586V3a1 1 0 10-2 0v4.586l-.293-.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <span>constructor (ignored)</span>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      );
    } else {
      return (
        <div className="mb-2" key={`${sdkName}-${className}`}>
          <div className="bg-white border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] h-[72px] flex flex-col">
            <div className="p-3 flex-1 flex flex-col justify-center">
              <div className="flex items-center space-x-2">
                <h3
                  className="text-sm font-semibold text-gray-600"
                  style={{ fontFamily: "MS Sans Serif, sans-serif" }}
                >
                  {className}
                </h3>
                <div className="flex items-center space-x-1">
                  {getComparisonIcon()}
                </div>
              </div>
              <div className="text-sm text-gray-400 italic">
                Not implemented in {sdkName === "ts" ? "TypeScript" : "Python"}
              </div>
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div
      className="min-h-screen bg-[#C0C0C0] flex flex-col"
      style={{ fontFamily: "MS Sans Serif, sans-serif" }}
    >
      {/* Header */}
      <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center">
            <div className="flex-1 text-center">
              <div className="relative h-[300px] sm:h-[400px] lg:h-[500px] w-full overflow-hidden">
                <HyperText
                  className="text-2xl sm:text-3xl lg:text-4xl font-bold text-black"
                  style={{ fontFamily: "Press Start 2P, monospace" }}
                >
                  are we driftpy yet?
                </HyperText>
                <ComicText fontSize={2} className="sm:hidden">
                  probably not!
                </ComicText>
                <ComicText fontSize={3} className="hidden sm:block">
                  probably not!
                </ComicText>
                <RetroGrid
                  lightLineColor="#000000"
                  darkLineColor="#000000"
                ></RetroGrid>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
                  {/* Mobile indicator for testing */}
                  <div className="lg:hidden text-xs text-red-600 font-bold mb-2">
                    MOBILE VIEW
                  </div>
                  <div
                    className="cursor-pointer"
                    onClick={() => {
                      window.open(
                        "https://github.com/drift-labs/protocol-v2/tree/master/sdk/src",
                        "_blank"
                      );
                    }}
                  >
                    <Tilt>
                      <img
                        src="/typescript.png"
                        className="w-40 h-40 sm:w-60 sm:h-60 lg:w-80 lg:h-80"
                      />
                    </Tilt>
                  </div>
                  <div
                    className="cursor-pointer"
                    onClick={() => {
                      window.open(
                        "https://github.com/drift-labs/driftpy/tree/master/src/driftpy",
                        "_blank"
                      );
                    }}
                  >
                    <Tilt>
                      <img
                        src="/python.png"
                        className="w-40 h-40 sm:w-60 sm:h-60 lg:w-80 lg:h-80"
                      />
                    </Tilt>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Filter Controls */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Search Bar */}
        <div className="relative mb-4">
          <input
            type="text"
            placeholder="Search classes and methods..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 bg-white border-2 border-t-[#808080] border-l-[#808080] border-r-[#FFFFFF] border-b-[#FFFFFF] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] text-black"
            style={{ fontFamily: "MS Sans Serif, sans-serif" }}
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <svg
              className="h-5 w-5 text-black"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        {/* Filter Checkboxes */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4 items-start sm:items-center mb-4">
          <span className="text-sm font-medium text-black">Show:</span>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showCommon}
              onChange={(e) => setShowCommon(e.target.checked)}
              className="w-4 h-4 border-2 border-t-[#808080] border-l-[#808080] border-r-[#FFFFFF] border-b-[#FFFFFF] bg-white"
            />
            <span className="text-sm text-black">
              Common classes (both SDKs)
            </span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showTsOnly}
              onChange={(e) => setShowTsOnly(e.target.checked)}
              className="w-4 h-4 border-2 border-t-[#808080] border-l-[#808080] border-r-[#FFFFFF] border-b-[#FFFFFF] bg-white"
            />
            <span className="text-sm text-black">TypeScript only</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showPythonOnly}
              onChange={(e) => setShowPythonOnly(e.target.checked)}
              className="w-4 h-4 border-2 border-t-[#808080] border-l-[#808080] border-r-[#FFFFFF] border-b-[#FFFFFF] bg-white"
            />
            <span className="text-sm text-black">Python only</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hideEmptyClasses}
              onChange={(e) => setHideEmptyClasses(e.target.checked)}
              className="w-4 h-4 border-2 border-t-[#808080] border-l-[#808080] border-r-[#FFFFFF] border-b-[#FFFFFF] bg-white"
            />
            <span className="text-sm text-black">Hide empty classes</span>
          </label>
        </div>

        {/* Icon Legend */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4 items-start sm:items-center text-xs text-gray-600">
          <span className="font-medium">Legend:</span>
          <div className="flex items-center space-x-1">
            <svg
              className="w-3 h-3 text-green-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Same method count / Implemented in both</span>
          </div>
          <div className="flex items-center space-x-1">
            <svg
              className="w-3 h-3 text-blue-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>TypeScript has more / Only in TS</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-lg">🐍</span>
            <span>Python has more / Only in Python</span>
          </div>
          <div className="flex items-center space-x-1">
            <svg
              className="w-3 h-3 text-gray-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 002.828 0l2-2a1 1 0 00-1.414-1.414L11 7.586V3a1 1 0 10-2 0v4.586l-.293-.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>Missing in one SDK</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] p-4">
            <h3 className="text-lg font-semibold text-black">TypeScript SDK</h3>
            <p className="text-black">{tsData.classes.length} classes</p>
          </div>
          <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] p-4">
            <h3 className="text-lg font-semibold text-black">Python SDK</h3>
            <p className="text-black">{pythonData.classes.length} classes</p>
          </div>
          <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] p-4">
            <h3 className="text-lg font-semibold text-black">Common Classes</h3>
            <p className="text-black">
              {
                sortedClassNames.filter(
                  (name) => tsClassesMap.has(name) && pythonClassesMap.has(name)
                ).length
              }{" "}
              classes
            </p>
          </div>
          <div className="bg-[#C0C0C0] border-2 border-t-[#FFFFFF] border-l-[#FFFFFF] border-r-[#808080] border-b-[#808080] shadow-[inset_1px_1px_0px_#808080,inset_-1px_-1px_0px_#FFFFFF] p-4">
            <h3 className="text-lg font-semibold text-black">Unique Classes</h3>
            <p className="text-black">
              {
                sortedClassNames.filter(
                  (name) =>
                    !tsClassesMap.has(name) || !pythonClassesMap.has(name)
                ).length
              }{" "}
              classes
            </p>
          </div>
        </div>
      </div>

      {/* Two Column Comparison */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* TypeScript Column */}
        <div className="flex-1 bg-[#C0C0C0] border-r-0 lg:border-r-2 border-r-[#808080] border-b-2 lg:border-b-0 border-b-[#808080] mb-4 lg:mb-0">
          <div className="bg-[#000080] text-white px-6 py-4 sticky top-0 z-10 border-b-2 border-b-[#808080]">
            <h2
              className="text-lg font-semibold"
              style={{
                fontFamily: "Press Start 2P, monospace",
                fontSize: "19px",
              }}
            >
              TypeScript SDK
            </h2>
          </div>
          <div
            className="p-4 h-full overflow-y-auto bg-[#C0C0C0]"
            ref={tsColumnRef}
            onScroll={() => handleScroll(tsColumnRef, pythonColumnRef)}
          >
            {filteredClassNames.map((className, index) => (
              <div key={`ts-${className}`}>
                {renderClassCard(
                  className,
                  tsClassesMap.get(className),
                  "ts",
                  true
                )}
                {index < filteredClassNames.length - 1 && (
                  <div className="border-t border-[#808080] my-4" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Python Column */}
        <div className="flex-1 bg-[#C0C0C0]">
          <div className="bg-[#008000] text-white px-6 py-4 sticky top-0 z-10 border-b-2 border-b-[#808080]">
            <h2
              className="text-lg font-semibold"
              style={{
                fontFamily: "Press Start 2P, monospace",
                fontSize: "19px",
              }}
            >
              Python SDK
            </h2>
          </div>
          <div
            className="p-4 h-full overflow-y-auto bg-[#C0C0C0]"
            ref={pythonColumnRef}
            onScroll={() => handleScroll(pythonColumnRef, tsColumnRef)}
          >
            {filteredClassNames.map((className, index) => (
              <div key={`python-${className}`}>
                {renderClassCard(
                  className,
                  pythonClassesMap.get(className),
                  "python",
                  false
                )}
                {index < filteredClassNames.length - 1 && (
                  <div className="border-t border-[#808080] my-4" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
