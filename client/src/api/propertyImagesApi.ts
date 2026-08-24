import api from "@/lib/axios";
import type { IPropertyImage } from "@/common/types/propertyImage";

interface ListResponse {
  images: IPropertyImage[];
}
interface OneResponse {
  image: IPropertyImage;
}

export const propertyImagesApi = {
  async list(propertyId: number): Promise<IPropertyImage[]> {
    const { data } = await api.get<ListResponse>(`/properties/${propertyId}/images`);
    return data.images;
  },

  async upload(propertyId: number, file: File): Promise<IPropertyImage> {
    const form = new FormData();
    form.append("file", file);
    // Do NOT set Content-Type — axios sets the multipart boundary automatically.
    const { data } = await api.post<OneResponse>(`/properties/${propertyId}/images`, form);
    return data.image;
  },

  /** Fetch the (decrypted) image bytes as a Blob — rendered via an object URL. */
  async download(propertyId: number, id: number): Promise<Blob> {
    const { data } = await api.get<Blob>(`/properties/${propertyId}/images/${id}/download`, {
      responseType: "blob",
    });
    return data;
  },

  async remove(propertyId: number, id: number): Promise<void> {
    await api.delete(`/properties/${propertyId}/images/${id}`);
  },
};
