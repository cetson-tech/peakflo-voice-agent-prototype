import mongoose, { Schema, Document, Types } from "mongoose";

export interface IMessage extends Document {
  sessionId: Types.ObjectId;
  role: "user" | "assistant" | "system";
  content: string;
  audioUrl?: string;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "Session",
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["user", "assistant", "system"],
    },
    content: {
      type: String,
      required: true,
    },
    audioUrl: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

MessageSchema.index({ sessionId: 1, createdAt: 1 });

export default mongoose.models.Message ||
  mongoose.model<IMessage>("Message", MessageSchema);
