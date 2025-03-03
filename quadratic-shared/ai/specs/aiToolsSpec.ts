import type { AISource, AIToolArgs } from 'quadratic-shared/typesAndSchemasAI';
import { z } from 'zod';

export enum AITool {
  SetChatName = 'set_chat_name',
  AddDataTable = 'add_data_table',
  SetCellValues = 'set_cell_values',
  SetCodeCellValue = 'set_code_cell_value',
  MoveCells = 'move_cells',
  DeleteCells = 'delete_cells',
  UpdateCodeCell = 'update_code_cell',
  CodeEditorCompletions = 'code_editor_completions',
  UserPromptSuggestions = 'user_prompt_suggestions',
}

export const AIToolSchema = z.enum([
  AITool.SetChatName,
  AITool.AddDataTable,
  AITool.SetCellValues,
  AITool.SetCodeCellValue,
  AITool.MoveCells,
  AITool.DeleteCells,
  AITool.UpdateCodeCell,
  AITool.CodeEditorCompletions,
  AITool.UserPromptSuggestions,
]);

type AIToolSpec<T extends keyof typeof AIToolsArgsSchema> = {
  sources: AISource[];
  description: string; // this is sent with tool definition, has a maximum character limit
  parameters: {
    type: 'object';
    properties: Record<string, AIToolArgs>;
    required: string[];
    additionalProperties: boolean;
  };
  responseSchema: (typeof AIToolsArgsSchema)[T];
  prompt: string; // this is sent as internal message to AI, no character limit
};

const numberSchema = z.number().or(
  z.string().transform((str) => {
    const num = Number(str);
    if (isNaN(num)) {
      throw new Error('Invalid number format');
    }
    return num;
  })
);

const array2DSchema = z.array(z.array(z.union([z.string(), z.number()]).transform(String))).or(
  z.string().transform((str) => {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map((row) => {
          if (!Array.isArray(row)) {
            throw new Error('Invalid 2D array format - each row must be an array');
          }
          return row.map(String);
        });
      }
      throw new Error('Invalid 2D array format');
    } catch {
      throw new Error('Invalid 2D array format');
    }
  })
);

const cellLanguageSchema = z
  .string()
  .transform((val) => val.toLowerCase())
  .pipe(z.enum(['python', 'javascript', 'formula']))
  .transform((val) => val.charAt(0).toUpperCase() + val.slice(1))
  .pipe(z.enum(['Python', 'Javascript', 'Formula']));

export const AIToolsArgsSchema = {
  [AITool.SetChatName]: z.object({
    chat_name: z.string(),
  }),
  [AITool.AddDataTable]: z.object({
    top_left_position: z.string(),
    table_name: z.string(),
    table_data: array2DSchema,
  }),
  [AITool.SetCodeCellValue]: z.object({
    code_cell_language: cellLanguageSchema,
    code_cell_position: z.string(),
    code_string: z.string(),
    output_width: numberSchema,
    output_height: numberSchema,
  }),
  [AITool.SetCellValues]: z.object({
    top_left_position: z.string(),
    cell_values: array2DSchema,
  }),
  [AITool.MoveCells]: z.object({
    source_selection_rect: z.string(),
    target_top_left_position: z.string(),
  }),
  [AITool.DeleteCells]: z.object({
    selection: z.string(),
  }),
  [AITool.UpdateCodeCell]: z.object({
    code_string: z.string(),
  }),
  [AITool.CodeEditorCompletions]: z.object({
    text_delta_at_cursor: z.string(),
  }),
  [AITool.UserPromptSuggestions]: z.object({
    prompt_suggestions: z.array(
      z.object({
        label: z.string(),
        prompt: z.string(),
      })
    ),
  }),
} as const;

export type AIToolSpecRecord = {
  [K in AITool]: AIToolSpec<K>;
};

export const aiToolsSpec: AIToolSpecRecord = {
  [AITool.SetChatName]: {
    sources: ['GetChatName'],
    description: `
Set the name of the user chat with AI assistant, this is the name of the chat in the chat history\n
You should use the set_chat_name function to set the name of the user chat with AI assistant, this is the name of the chat in the chat history.\n
This function requires the name of the chat, this should be concise and descriptive of the conversation, and should be easily understandable by a non-technical user.\n
The chat name should be based on user's messages and should reflect his/her queries and goals.\n
This name should be from user's perspective, not the assistant's.\n
`,
    parameters: {
      type: 'object',
      properties: {
        chat_name: {
          type: 'string',
          description: 'The name of the chat',
        },
      },
      required: ['chat_name'],
      additionalProperties: false,
    },
    responseSchema: AIToolsArgsSchema[AITool.SetChatName],
    prompt: `
You can use the set_chat_name function to set the name of the user chat with AI assistant, this is the name of the chat in the chat history.\n
This function requires the name of the chat, this should be concise and descriptive of the conversation, and should be easily understandable by a non-technical user.\n
The chat name should be based on user's messages and should reflect his/her queries and goals.\n
This name should be from user's perspective, not the assistant's.\n
`,
  },
  [AITool.AddDataTable]: {
    sources: ['AIAnalyst'],
    description: `
Adds a data table to the currently open sheet, requires the top left cell position (in a1 notation), the name of the data table and the data to add. The data should be a 2d array of strings, where each sub array represents a row of values.\n
The first row of the data table is considered to be the header row, and the data table will be created with the first row as the header row.\n
Always use this tool when adding a new tabular data to the currently open sheet. Don't use set_cell_values function to add tabular data.\n
Don't use this tool to add data to an existing data table. Use set_cell_values function to add data to an existing data table.\n
Always prefer using this tool to add structured data to the currently open sheet. Don't use set_cell_values or set_code_cell_value function to add structured data.\n
`,
    parameters: {
      type: 'object',
      properties: {
        top_left_position: {
          type: 'string',
          description:
            'The top left position of the data table on the currently open sheet, in a1 notation. This should be a single cell, not a range.',
        },
        table_name: {
          type: 'string',
          description:
            "The name of the data table to add to the currently open sheet. This should be a concise and descriptive name of the data table. Don't use special characters or spaces in the name. Always use a unique name for the data table. Spaces, if any, in name are replaced with underscores.",
        },
        table_data: {
          type: 'array',
          items: {
            type: 'array',
            items: {
              type: 'string',
              description: 'The string that is the value to set in the cell',
            },
          },
        },
      },
      required: ['top_left_position', 'table_name', 'table_data'],
      additionalProperties: false,
    },
    responseSchema: AIToolsArgsSchema[AITool.AddDataTable],
    prompt: `
Adds a data table to the currently open sheet, requires the top_left_position (in a1 notation), the name of the data table and the data to add. The data should be a 2d array of strings, where each sub array represents a row of values.\n
top_left_position is the anchor position of the data table.\n
The first row of the data table is considered to be the header row, and the data table will be created with the first row as the header row.\n
Always use this tool when adding a new tabular data to the currently open sheet. Don't use set_cell_values function to add tabular data.\n
Don't use this tool to add data to a data table that already exists. Use set_cell_values function to add data to a data table that already exists.\n
All values can be referenced in the code cells immediately. Always refer to the cell by its position on respective sheet, in a1 notation. Don't add values manually in code cells.\n
To delete a data table, use set_cell_values function with the top_left_position of the data table and with just one empty string value at the top_left_position. Overwriting the top_left_position (anchor position) deletes the data table.\n
`,
  },
  [AITool.SetCellValues]: {
    sources: ['AIAnalyst'],
    description: `
Sets the values of the currently open sheet cells to a 2d array of strings, requires the top_left_position (in a1 notation) and the 2d array of strings representing the cell values to set.\n
Use set_cell_values function to add data to the currently open sheet. Don't use code cell for adding data. Always add data using this function.\n
Values are string representation of text, number, logical, time instant, duration, error, html, code, image, date, time or blank.\n
top_left_position is the position of the top left corner of the 2d array of values on the currently open sheet, in a1 notation. This should be a single cell, not a range. Each sub array represents a row of values.\n
All values can be referenced in the code cells immediately. Always refer to the cell by its position on respective sheet, in a1 notation. Don't add values manually in code cells.\n
To clear the values of a cell, set the value to an empty string.\n
`,
    parameters: {
      type: 'object',
      properties: {
        top_left_position: {
          type: 'string',
          description:
            'The position of the top left cell, in a1 notation, in the currently open sheet. This is the top left corner of the added 2d array of values on the currently open sheet. This should be a single cell, not a range.',
        },
        cell_values: {
          type: 'array',
          items: {
            type: 'array',
            items: {
              type: 'string',
              description: 'The string that is the value to set in the cell',
            },
          },
        },
      },
      required: ['top_left_position', 'cell_values'],
      additionalProperties: false,
    },
    responseSchema: AIToolsArgsSchema[AITool.SetCellValues],
    prompt: `
You should use the set_cell_values function to set the values of the currently open sheet cells to a 2d array of strings.\n
Use this function to add data to the currently open sheet. Don't use code cell for adding data. Always add data using this function.\n
This function requires the top_left_position (in a1 notation) and the 2d array of strings representing the cell values to set. Values are string representation of text, number, logical, time instant, duration, error, html, code, image, date, time or blank.\n
Values set using this function will replace the existing values in the cell and can be referenced in the code cells immediately. Always refer to the cell by its position on respective sheet, in a1 notation. Don't add these in code cells.\n
To clear the values of a cell, set the value to an empty string.\n
`,
  },
  [AITool.SetCodeCellValue]: {
    sources: ['AIAnalyst'],
    description: `
Sets the value of a code cell and run it in the currently open sheet, requires the cell position (in a1 notation), codeString and language\n
You should use the set_code_cell_value function to set this code cell value. Use this function instead of responding with code.\n
Never use set_code_cell_value function to set the value of a cell to a value that is not a code. Don't add static data to the currently open sheet using set_code_cell_value function, use set_cell_values instead. set_code_cell_value function is only meant to set the value of a cell to a code.\n
Always refer to the data from cell by its position in a1 notation from respective sheet. Don't add values manually in code cells.\n
`,
    parameters: {
      type: 'object',
      properties: {
        code_cell_language: {
          type: 'string',
          description:
            'The language of the code cell, this can be one of Python, Javascript or Formula. This is case sensitive.',
        },
        code_cell_position: {
          type: 'string',
          description:
            'The position of the code cell in the currently open sheet, in a1 notation. This should be a single cell, not a range.',
        },
        code_string: {
          type: 'string',
          description: 'The code which will run in the cell',
        },
        output_width: {
          type: 'number',
          description:
            'The width, i.e. number of columns, of the code output on running this Code in the currently open spreadsheet',
        },
        output_height: {
          type: 'number',
          description:
            'The height, i.e. number of rows, of the code output on running this Code in the currently open spreadsheet',
        },
      },
      required: ['code_cell_language', 'code_cell_position', 'code_string', 'output_width', 'output_height'],
      additionalProperties: false,
    },
    responseSchema: AIToolsArgsSchema[AITool.SetCodeCellValue],
    prompt: `
You should use the set_code_cell_value function to set this code cell value. Use set_code_cell_value function instead of responding with code.\n
Never use set_code_cell_value function to set the value of a cell to a value that is not a code. Don't add data to the currently open sheet using set_code_cell_value function, use set_cell_values instead. set_code_cell_value function is only meant to set the value of a cell to a code.\n
set_code_cell_value function requires language, codeString, the cell position (single cell in a1 notation) and the width and height of the code output on running this Code in the currently open sheet.\n
Always refer to the cells on sheet by its position in a1 notation, using q.cells function. Don't add values manually in code cells.\n
The required location code_cell_position for this code cell is one which satisfies the following conditions:\n
 - The code cell location should be empty and should have enough space to the right and below to accommodate the code result. If there is a value in a single cell where the code result is suppose to go, it will result in spill error. Use currently open sheet context to identify empty space.\n
 - The code cell should be near the data it references, so that it is easy to understand the code in the context of the data. Identify the data being referred from code and use a cell close to it. If multiple data references are being made, choose the one which is most used or most important. This will make it easy to understand the code in the context of the table.\n
 - If the referenced data is portrait in a table format, the code cell should be next to the top right corner of the table.\n
 - If the referenced data is landscape in a table format, the code cell should be below the bottom left corner of the table.\n
 - Always leave a blank row / column between the code cell and the data it references.\n
 - In case there is not enough empty space near the referenced data, choose a distant empty cell which is in the same row as the top right corner of referenced data and to the right of this data.\n
 - If there are multiple tables or data sources being referenced, place the code cell in a location that provides a good balance between proximity to all referenced data and maintaining readability of the currently open sheet.\n
 - Consider the overall layout and organization of the currently open sheet when placing the code cell, ensuring it doesn't disrupt existing data or interfere with other code cells.\n
 - A plot returned by the code cell occupies space on the sheet and spills if there is any data present in the sheet where the plot is suppose to take place. Default size of a new plot is 7 wide * 23 tall cells.\n
 - Do not use conditional returns in python code cells.\n
 - Don't prefix formulas with \`=\` in code cells.\n
 `,
  },
  [AITool.MoveCells]: {
    sources: ['AIAnalyst'],
    description: `
Moves a rectangular selection of cells from one location to another on the currently open sheet, requires the source and target locations.\n
You should use the move_cells function to move a rectangular selection of cells from one location to another on the currently open sheet.\n
move_cells function requires the source and target locations. Source location is the top left and bottom right corners of the selection rectangle to be moved.\n
Target location is the top left corner of the target location on the currently open sheet.\n
`,
    parameters: {
      type: 'object',
      properties: {
        source_selection_rect: {
          type: 'string',
          description:
            'The selection of cells, in a1 notation, to be moved in the currently open sheet. This is string representation of the rectangular selection of cells to be moved',
        },
        target_top_left_position: {
          type: 'string',
          description:
            'The top left position of the target location on the currently open sheet, in a1 notation. This should be a single cell, not a range. This will be the top left corner of the source selection rectangle after moving.',
        },
      },
      required: ['source_selection_rect', 'target_top_left_position'],
      additionalProperties: false,
    },
    responseSchema: AIToolsArgsSchema[AITool.MoveCells],
    prompt: `
You should use the move_cells function to move a rectangular selection of cells from one location to another on the currently open sheet.\n
move_cells function requires the source selection and target position. Source selection is the string representation (in a1 notation) of a selection rectangle to be moved.\n
Target position is the top left corner of the target position on the currently open sheet, in a1 notation. This should be a single cell, not a range.\n
`,
  },
  [AITool.DeleteCells]: {
    sources: ['AIAnalyst'],
    description: `
Deletes the value(s) of a selection of cells, requires a string representation of a selection of cells to delete. Selection can be a single cell or a range of cells or multiple ranges in a1 notation.\n
You should use the delete_cells function to delete the value(s) of a selection of cells on the currently open sheet.\n
delete_cells functions requires a string representation (in a1 notation) of a selection of cells to delete. Selection can be a single cell or a range of cells or multiple ranges in a1 notation.\n
`,
    parameters: {
      type: 'object',
      properties: {
        selection: {
          type: 'string',
          description:
            'The string representation (in a1 notation) of the selection of cells to delete, this can be a single cell or a range of cells or multiple ranges in a1 notation',
        },
      },
      required: ['selection'],
      additionalProperties: false,
    },
    responseSchema: AIToolsArgsSchema[AITool.DeleteCells],
    prompt: `
You should use the delete_cells function to delete value(s) on the currently open sheet.\n
delete_cells functions requires a string representation (in a1 notation) of a selection of cells to delete. Selection can be a single cell or a range of cells or multiple ranges in a1 notation.\n
`,
  },
  [AITool.UpdateCodeCell]: {
    sources: ['AIAssistant'],
    description: `
This tool updates the code in the code cell you are currently editing, requires the code string to update the code cell with. Provide the full code string, don't provide partial code. This will replace the existing code in the code cell.\n
The code cell editor will switch to diff editor mode and will show the changes you made to the code cell, user can accept or reject the changes.\n
New code runs in the cell immediately, so the user can see output of the code cell after it is updates.\n
Never include code in the chat when using this tool, always explain brief what changes are made and why.\n
When using this tool, make sure this is the only tool used in the response.\n
`,
    parameters: {
      type: 'object',
      properties: {
        code_string: {
          type: 'string',
          description: 'The code string to update the code cell with',
        },
      },
      required: ['code_string'],
      additionalProperties: false,
    },
    responseSchema: AIToolsArgsSchema[AITool.UpdateCodeCell],
    prompt: `
You should use the update_code_cell function to update the code in the code cell you are currently editing.\n
update_code_cell function requires the code string to update the code cell with.\n
Provide the full code string, don't provide partial code. This will replace the existing code in the code cell.\n
The code cell editor will switch to diff editor mode and will show the changes you made to the code cell, user can accept or reject the changes.\n
New code runs in the cell immediately, so the user can see output of the code cell after it is updates.\n
Never include code in the chat when using this tool, always explain brief what changes are made and why.\n
When using this tool, make sure this is the only tool used in the response.\n
When using this tool, make sure the code cell is the only cell being edited.\n
`,
  },
  [AITool.CodeEditorCompletions]: {
    sources: ['CodeEditorCompletions'],
    description: `
This tool provides inline completions for the code in the code cell you are currently editing, requires the completion for the code in the code cell.\n
You are provided with the prefix and suffix of the cursor position in the code cell.\n
Completion is the delta that will be inserted at the cursor position in the code cell.\n
`,
    parameters: {
      type: 'object',
      properties: {
        text_delta_at_cursor: {
          type: 'string',
          description: 'The completion for the code in the code cell at the cursor position',
        },
      },
      required: ['text_delta_at_cursor'],
      additionalProperties: false,
    },
    responseSchema: AIToolsArgsSchema[AITool.CodeEditorCompletions],
    prompt: `
This tool provides inline completions for the code in the code cell you are currently editing, you are provided with the prefix and suffix of the cursor position in the code cell.\n
You should use this tool to provide inline completions for the code in the code cell you are currently editing.\n
Completion is the delta that will be inserted at the cursor position in the code cell.\n
`,
  },
  [AITool.UserPromptSuggestions]: {
    sources: ['GetUserPromptSuggestions'],
    description: `
This tool provides prompt suggestions for the user, requires an array of three prompt suggestions.\n
Each prompt suggestion is an object with a label and a prompt.\n
The label is a short label for the prompt suggestion, this will be displayed to the user in the UI.\n
The prompt is the actual prompt that will be used to generate the prompt suggestion.\n
Use the internal context and the chat history to provide the prompt suggestions.\n
Always maintain strong correlation between the follow up prompts and the user's chat history and the internal context.\n
`,
    parameters: {
      type: 'object',
      properties: {
        prompt_suggestions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: 'The label of the follow up prompt',
              },
              prompt: {
                type: 'string',
                description: 'The prompt for the user',
              },
            },
            required: ['label', 'prompt'],
            additionalProperties: false,
          },
        },
      },
      required: ['prompt_suggestions'],
      additionalProperties: false,
    },
    responseSchema: AIToolsArgsSchema[AITool.UserPromptSuggestions],
    prompt: `
This tool provides prompt suggestions for the user, requires an array of three prompt suggestions.\n
Each prompt suggestion is an object with a label and a prompt.\n
The label is a short label for the prompt suggestion, this will be displayed to the user in the UI.\n
The prompt is the actual prompt that will be used to generate the prompt suggestion.\n
Use the internal context and the chat history to provide the prompt suggestions.\n
Always maintain strong correlation between the prompt suggestions and the user's chat history and the internal context.\n
`,
  },
} as const;
