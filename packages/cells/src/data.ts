/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { IAttachmentsModel } from '@jupyterlab/attachments';

import { CodeEditor, ICodeEditorData } from '@jupyterlab/codeeditor';

import { nbformat } from '@jupyterlab/coreutils';

import { DatastoreExt } from '@jupyterlab/datastore';

import { OutputAreaData } from '@jupyterlab/outputarea';

import { IOutputData } from '@jupyterlab/rendermime';

import { JSONExt, JSONObject, ReadonlyJSONValue } from '@phosphor/coreutils';

import {
  Fields,
  ListField,
  MapField,
  RegisterField,
  Schema
} from '@phosphor/datastore';

/**
 * The namespace for `ICellData` interfaces, describing
 * where cells store their data in a datastore.
 */
export namespace ICellData {
  /**
   * A type for the common fields stored in the Cell schema.
   */
  export interface IBaseFields extends ICodeEditorData.IFields {
    /**
     * The type of the cell.
     */
    type: RegisterField<nbformat.CellType>;

    /**
     * Whether the cell is trusted.
     */
    trusted: RegisterField<boolean>;

    /**
     * The metadata for the cell.
     */
    metadata: MapField<ReadonlyJSONValue>;
  }

  /**
   * A union interface for all the fields stored in cell schemas
   * so that they may be stored in the same table.
   */
  export interface IFields
    extends IBaseFields,
      ICodeCellData.IFields,
      IAttachmentsCellData.IFields {}

  /**
   * An interface for a cell schema.
   */
  export interface ISchema extends Schema {
    /**
     * The id for the schema.
     */
    id: '@jupyterlab/cells:cellmodel.v1';

    /**
     * The union of cell fields.
     */
    fields: IFields;
  }

  /**
   * The location of cell data in a datastore.
   */
  export type DataLocation = {
    /**
     * The record for the cell data.
     */
    record: DatastoreExt.RecordLocation<ISchema>;

    /**
     * A table in which outputs are stored.
     */
    outputs: DatastoreExt.TableLocation<IOutputData.ISchema>;
  };
}

/**
 * The namespace for `IAttachmentsCellData` interfaces.
 */
export namespace IAttachmentsCellData {
  /**
   * An interface for cell schema fields that can store attachments.
   */
  export interface IFields
    extends ICellData.IBaseFields,
      IAttachmentsModel.IFields {}
}

/**
 * The namespace for `ICodeCellData` statics.
 */
export namespace ICodeCellData {
  /**
   * The schema type for code cell models.
   */
  export interface IFields extends ICellData.IBaseFields {
    /**
     * Execution count for the cell.
     */
    executionCount: RegisterField<nbformat.ExecutionCount>;

    /**
     * A list of output ids for the cell.
     */
    outputs: ListField<string>;
  }
}

/**
 * Utility functions for operating on cell data.
 */
export namespace CellData {
  /**
   * A concrete schema for a cell table, available at runtime.
   */
  export const SCHEMA: ICellData.ISchema = {
    /**
     * The id for the schema.
     */
    id: '@jupyterlab/cells:cellmodel.v1',

    /**
     * The union of cell fields.
     */
    fields: {
      attachments: Fields.Map<nbformat.IMimeBundle>(),
      executionCount: Fields.Register<nbformat.ExecutionCount>({ value: null }),
      metadata: Fields.Map<ReadonlyJSONValue>(),
      mimeType: Fields.String(),
      outputs: Fields.List<string>(),
      selections: Fields.Map<CodeEditor.ITextSelection[]>(),
      text: Fields.Text(),
      trusted: Fields.Boolean(),
      type: Fields.Register<nbformat.CellType>({ value: 'code' })
    }
  };

  /**
   * Construct a cell model from optional cell content.
   */
  export function fromJSON(
    loc: ICellData.DataLocation,
    cell?: nbformat.IBaseCell
  ) {
    // Get the intitial data for the model.
    let trusted = false;
    let metadata: JSONObject = {};
    let text = '';
    let type: nbformat.CellType = 'code';
    if (cell) {
      metadata = JSONExt.deepCopy(cell.metadata);
      trusted = !!metadata['trusted'];
      delete metadata['trusted'];

      if (cell.cell_type !== 'raw') {
        delete metadata['format'];
      }
      if (cell.cell_type !== 'code') {
        delete metadata['collapsed'];
        delete metadata['scrolled'];
      }

      if (Array.isArray(cell.source)) {
        text = (cell.source as string[]).join('');
      } else {
        text = (cell.source as string) || '';
      }

      type = cell.cell_type as nbformat.CellType;
    }
    // Set the intitial data for the model.
    DatastoreExt.withTransaction(loc.record.datastore, () => {
      DatastoreExt.updateRecord(loc.record, {
        type,
        metadata,
        trusted,
        text: { index: 0, remove: 0, text }
      });
    });
  }

  /**
   * Convert a cell at a given data location to JSON.
   * This delegates to specific versions of `toJSON` based
   * on the cell type.
   */
  export function toJSON(loc: ICellData.DataLocation): nbformat.ICell {
    let data = DatastoreExt.getRecord(loc.record);
    switch (data.type) {
      case 'code':
        return CodeCellData.toJSON(loc);
        break;
      case 'markdown':
        return MarkdownCellData.toJSON(loc);
        break;
      default:
        return RawCellData.toJSON(loc);
    }
  }
}

/**
 * The namespace for `AttachmentsCellData` statics.
 */
export namespace AttachmentsCellData {
  /**
   * Construct a new cell with optional attachments.
   */
  export function fromJSON(
    loc: ICellData.DataLocation,
    cell?: nbformat.IBaseCell
  ): void {
    // TODO: resurrect cell attachments.
    CellData.fromJSON(loc, cell);
  }

  /**
   * Serialize the model to JSON.
   */
  export function toJSON(
    loc: ICellData.DataLocation
  ): nbformat.IRawCell | nbformat.IMarkdownCell {
    return Private.baseToJSON(loc) as
      | nbformat.IRawCell
      | nbformat.IMarkdownCell;
  }
}

/**
 * Utility functions for working with RawCellData.
 */
export namespace RawCellData {
  /**
   * Construct a new cell with optional attachments.
   */
  export function fromJSON(
    loc: ICellData.DataLocation,
    cell?: nbformat.IRawCell
  ): void {
    // TODO: resurrect cell attachments.
    DatastoreExt.withTransaction(loc.record.datastore, () => {
      AttachmentsCellData.fromJSON(loc, cell);
      DatastoreExt.updateRecord(loc.record, {
        type: 'raw'
      });
    });
  }

  /**
   * Serialize the model to JSON.
   */
  export function toJSON(loc: ICellData.DataLocation): nbformat.IRawCell {
    return AttachmentsCellData.toJSON(loc) as nbformat.IRawCell;
  }
}

/**
 * Utility functions for working with MarkdownCellData.
 */
export namespace MarkdownCellData {
  /**
   * Construct a new cell with optional attachments.
   */
  export function fromJSON(
    loc: ICellData.DataLocation,
    cell?: nbformat.IMarkdownCell
  ): void {
    // TODO: resurrect cell attachments.
    DatastoreExt.withTransaction(loc.record.datastore, () => {
      AttachmentsCellData.fromJSON(loc, cell);
      DatastoreExt.updateRecord(loc.record, {
        mimeType: 'text/x-ipythongfm',
        type: 'markdown'
      });
    });
  }

  /**
   * Serialize the model to JSON.
   */
  export function toJSON(loc: ICellData.DataLocation): nbformat.IMarkdownCell {
    return AttachmentsCellData.toJSON(loc) as nbformat.IMarkdownCell;
  }
}

/**
 * The namespace for `CodeCellData` statics.
 */
export namespace CodeCellData {
  /**
   * Construct a new code cell with optional original cell content.
   */
  export function fromJSON(
    loc: ICellData.DataLocation,
    cell?: nbformat.ICodeCell
  ) {
    let outputs: nbformat.IOutput[] = [];

    DatastoreExt.withTransaction(loc.record.datastore, () => {
      CellData.fromJSON(loc, cell);
      DatastoreExt.updateRecord(loc.record, {
        executionCount: cell ? cell.execution_count || null : null,
        type: 'code'
      });
      outputs = (cell && cell.outputs) || [];
      OutputAreaData.fromJSON(loc, outputs);
    });

    // We keep `collapsed` and `jupyter.outputs_hidden` metadata in sync, since
    // they are redundant in nbformat 4.4. See
    // https://github.com/jupyter/nbformat/issues/137
    /* DatastoreExt.listenField(
      { ...this.record, field: 'metadata' },
      Private.collapseChanged,
      this
    );

    // Sync `collapsed` and `jupyter.outputs_hidden` for the first time, giving
    // preference to `collapsed`.
    const metadata = DatastoreExt.getField({
      ...this.record,
      field: 'metadata'
    });
    if (metadata['collapsed']) {
      let collapsed = metadata['collapsed'];
      Private.collapseChanged(this.metadata, {
        type: 'change',
        key: 'collapsed',
        oldValue: collapsed,
        newValue: collapsed
      });
    } else if (this.metadata.has('jupyter')) {
      let jupyter = this.metadata.get('jupyter') as JSONObject;
      if (jupyter.hasOwnProperty('outputs_hidden')) {
        Private.collapseChanged(this.metadata, {
          type: 'change',
          key: 'jupyter',
          oldValue: jupyter,
          newValue: jupyter
        });
      }
    }*/
  }

  /**
   * Serialize the model to JSON.
   */
  export function toJSON(loc: ICellData.DataLocation): nbformat.ICodeCell {
    let cell = Private.baseToJSON(loc) as nbformat.ICodeCell;
    cell.execution_count = DatastoreExt.getField({
      ...loc.record,
      field: 'executionCount'
    });
    cell.outputs = OutputAreaData.toJSON(loc);
    return cell;
  }
}

namespace Private {
  /*export function collapseChanged(
    metadata: IObservableJSON,
    args: IObservableMap.IChangedArgs<JSONValue>
  ) {
    if (args.key === 'collapsed') {
      const jupyter = (metadata.get('jupyter') || {}) as JSONObject;
      const { outputs_hidden, ...newJupyter } = jupyter;

      if (outputs_hidden !== args.newValue) {
        if (args.newValue !== undefined) {
          newJupyter['outputs_hidden'] = args.newValue;
        }
        if (Object.keys(newJupyter).length === 0) {
          metadata.delete('jupyter');
        } else {
          metadata.set('jupyter', newJupyter);
        }
      }
    } else if (args.key === 'jupyter') {
      const jupyter = (args.newValue || {}) as JSONObject;
      if (jupyter.hasOwnProperty('outputs_hidden')) {
        metadata.set('collapsed', jupyter.outputs_hidden);
      } else {
        metadata.delete('collapsed');
      }
    }
  }*

  /**
   * Serialize the model to JSON.
   *
   * ### Notes
   * This is the common serialization logic for the three cell types,
   * and is called by the specializations of the cell types.
   * The `toJSON` function in this namespace correctly delegates
   * to the different subtypes.
   */
  export function baseToJSON(loc: ICellData.DataLocation): nbformat.ICell {
    let data = DatastoreExt.getRecord(loc.record);
    let metadata = data.metadata as JSONObject;
    if (data.trusted) {
      metadata['trusted'] = true;
    }
    return {
      cell_type: data.type,
      source: data.text,
      metadata
    } as nbformat.ICell;
  }
}