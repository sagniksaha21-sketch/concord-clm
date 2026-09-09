import { Controller, Get, NotFoundException, Param, Res, StreamableFile } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../persistence/prisma.service';
import { Roles } from '../auth/rbac';
@Controller('documents')
export class DocumentsController {
 constructor(private readonly storage: StorageService, private readonly prisma: PrismaService) {}
 @Roles('contract:read')
 @Get(':id/file')
 async file(@Param('id') id:string,@Res({passthrough:true}) res:{set:(headers:Record<string,string>)=>void}):Promise<StreamableFile>{
  if(!this.prisma.enabled) throw new NotFoundException('Document not found');
  const doc=await this.prisma.client.document.findUnique({where:{id},select:{blobPath:true}});
  if(!doc?.blobPath) throw new NotFoundException('Document not found');
  const f=await this.storage.get(doc.blobPath);
  res.set({'Content-Type':f.contentType,'Content-Disposition':`attachment; filename="${f.filename.replace(/["\r\n]/g,'_')}"`,'Cache-Control':'private, no-store'});
  return new StreamableFile(f.buffer);
 }
}
